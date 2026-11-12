"""Offline backend smoke tests. Run: python -m unittest discover -s tests -p 'test_*.py'"""
import http.client
import threading
import unittest
from http.server import ThreadingHTTPServer
import server


class BackendTests(unittest.TestCase):
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
            connection.close()
        finally:
            httpd.shutdown()
            httpd.server_close()
            thread.join(timeout=3)


if __name__ == "__main__":
    unittest.main()
