"""Offline backend smoke tests. Run: python -m unittest discover -s tests -p 'test_*.py'"""
import re
import http.client
import threading
import unittest
from http.server import ThreadingHTTPServer
import server


class BackendTests(unittest.TestCase):
    def scheduled(self, trips, at, exceptions=None, calendar=None):
        from unittest.mock import patch
        pattern = {'sample_trip': 'pattern', 'stops': ['a', 'b']}
        default_calendar = [{'service_id': 'weekday', 'start_date': '20260101',
                             'end_date': '20261231', 'monday': '1', 'tuesday': '1',
                             'wednesday': '1', 'thursday': '1', 'friday': '1',
                             'saturday': '0', 'sunday': '0'}]
        data = {'trips': {'pattern': trips}, 'calendar': calendar if calendar is not None else default_calendar,
                'exceptions': exceptions or []}
        with patch.object(server, 'gtfs', return_value={'patterns': [pattern]}), patch.dict(server.CACHE_SCHEDULE, data, clear=True):
            return server.scheduled_journey('pattern', 0, 1, at)['trips']

    def test_schedules_respect_weekdays_and_exclude_passed_departures(self):
        def trip(start, end):
            return ('weekday', ((start, start), (end, end)))
        trips = [trip('10:00:00', '10:20:00'), trip('07:00:00', '07:20:00'), trip('09:00:00', '09:20:00')]
        rows = self.scheduled(trips, '2026-11-09T08:00:00-08:00')
        self.assertTrue(rows[0]['departure'].startswith('2026-11-09T09:00'))
        self.assertTrue(rows[1]['departure'].startswith('2026-11-09T10:00'))
        self.assertEqual(self.scheduled(trips, '2026-11-14T08:00:00-08:00'), [])

    def test_service_calendar_removal_and_extra_service(self):
        trips = [('weekday', (('09:00:00', '09:00:00'), ('09:20:00', '09:20:00')))]
        removed = self.scheduled(trips, '2026-11-09T08:00:00-08:00',
                                 [{'service_id': 'weekday', 'date': '20261109', 'exception_type': '2'}])
        self.assertFalse(any(row['departure'].startswith('2026-11-09') for row in removed))
        extra = self.scheduled(trips, '2026-11-14T08:00:00-08:00',
                               [{'service_id': 'weekday', 'date': '20261114', 'exception_type': '1'}], calendar=[])
        self.assertEqual(len(extra), 1)
        self.assertTrue(extra[0]['departure'].startswith('2026-11-14T09:00'))

    def test_previous_service_day_overnight_bus(self):
        trips = [('weekday', (('25:00:00', '25:00:00'), ('25:20:00', '25:20:00')))]
        rows = self.scheduled(trips, '2026-11-10T00:30:00-08:00')
        self.assertTrue(rows[0]['departure'].startswith('2026-11-10T01:00'))
        self.assertEqual(rows[0]['ride_minutes'], 20)

    def test_invalid_schedule_times_do_not_become_usable_departures(self):
        trips = [('weekday', (('09:99:00', '09:99:00'), ('10:50:00', '10:50:00'))),
                 ('weekday', (('10:00:00', '10:00:00'), ('09:00:00', '09:00:00')))]
        self.assertEqual(self.scheduled(trips, '2026-11-09T08:00:00-08:00'), [])

    def test_numeric_parsing(self):
        self.assertEqual(server.num("37.87"), 37.87)
        self.assertIsNone(server.num("not-a-number"))

    def test_stop_monitoring_flattening(self):
        payload = {"ServiceDelivery": {"StopMonitoringDelivery": [{
            "MonitoredStopVisit": [{
                "RecordedAtTime": "2026-11-11T12:00:00Z",
                "MonitoredVehicleJourney": {
                    "LineRef": "51B", "VehicleRef": "123",
                    "MonitoredCall": {
                        "AimedArrivalTime": "2026-11-11T12:05:00Z",
                        "ExpectedArrivalTime": "2026-11-11T12:12:00Z"
                    }
                }
            }]
        }]}}
        visits = server.flatten_visits(payload)
        self.assertEqual(len(visits), 1)
        self.assertEqual(visits[0]["route"], "51B")
        self.assertEqual(visits[0]["vehicle"], "123")
        self.assertEqual(visits[0]["expected"], "2026-11-11T12:12:00Z")

    def test_ors_route_reports_provider_metrics_and_correct_coordinate_order(self):
        import io
        import json
        import os
        from unittest.mock import patch
        payload = {'features': [{'properties': {'summary': {'distance': 145.2, 'duration': 132}},
                                 'geometry': {'type': 'LineString', 'coordinates': [[-122.27, 37.87], [-122.269, 37.871]]}}]}
        sent = {}
        def fake_fetch(request, timeout):
            sent['url'] = request.full_url
            sent['payload'] = json.loads(request.data)
            return io.BytesIO(json.dumps(payload).encode())
        with patch.dict(os.environ, {'ORS_API_KEY': 'test-key'}), patch('urllib.request.urlopen', side_effect=fake_fetch):
            result = server.pedestrian_route(37.87, -122.27, 37.871, -122.269)
        self.assertEqual(sent['payload']['coordinates'], [[-122.27, 37.87], [-122.269, 37.871]])
        self.assertIn('/foot-walking/geojson', sent['url'])
        self.assertEqual(result['minutes'], 2.2)
        self.assertEqual(result['meters'], 145)
        self.assertEqual(result['geometry']['type'], 'LineString')
        self.assertFalse(result['accessibility_verified'])

    def test_ors_rejects_wrong_endpoints_and_nonfinite_duration(self):
        import io
        import json
        import os
        from unittest.mock import patch
        geometry = {'type': 'LineString', 'coordinates': [[-122.27, 37.87], [-122.20, 37.88]]}
        payload = {'features': [{'properties': {'summary': {'distance': 145.2, 'duration': 132}}, 'geometry': geometry}]}
        with patch.dict(os.environ, {'ORS_API_KEY': 'test-key'}), patch('urllib.request.urlopen', return_value=io.BytesIO(json.dumps(payload).encode())):
            with self.assertRaisesRegex(RuntimeError, 'too far'):
                server.pedestrian_route(37.87, -122.27, 37.871, -122.269)
        geometry['coordinates'][-1] = [-122.269, 37.871]
        payload['features'][0]['properties']['summary']['duration'] = float('nan')
        with patch.dict(os.environ, {'ORS_API_KEY': 'test-key'}), patch('urllib.request.urlopen', return_value=io.BytesIO(json.dumps(payload).encode())):
            with self.assertRaisesRegex(RuntimeError, 'metrics'):
                server.pedestrian_route(37.87, -122.27, 37.871, -122.269)

    def test_head_health_check_does_not_fetch_gtfs(self):
        httpd = ThreadingHTTPServer(("127.0.0.1", 0), server.Handler)
        thread = threading.Thread(target=httpd.serve_forever, daemon=True)
        thread.start()
        try:
            connection = http.client.HTTPConnection("127.0.0.1", httpd.server_port, timeout=3)
            connection.request("HEAD", "/")
            response = connection.getresponse()
            self.assertEqual(response.status, 200)
            self.assertEqual(response.read(), b"")
            connection.request("HEAD", "/health")
            response = connection.getresponse()
            self.assertEqual(response.status, 200)
            self.assertEqual(response.read(), b"")
            connection.request("GET", "/assets/app.js")
            response = connection.getresponse()
            self.assertEqual(response.status, 200)
            self.assertIn(b"function", response.read())
            # Every locally referenced controller/style must be publicly served.
            for asset in re.findall(r'(?:src|href)="(/assets/[^"?]+)"', (server.ROOT/'index.html').read_text()):
                connection.request('GET', asset)
                asset_response = connection.getresponse()
                self.assertEqual(asset_response.status, 200, asset)
                self.assertTrue(asset_response.read(), asset)
            connection.close()
        finally:
            httpd.shutdown()
            httpd.server_close()
            thread.join(timeout=3)


if __name__ == "__main__":
    unittest.main()
