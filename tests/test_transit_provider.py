import copy, io, json, os, pathlib, unittest
from unittest.mock import patch
import transit_provider as transit

FIXTURE=json.loads((pathlib.Path(__file__).parent/'fixtures/transit-plan.json').read_text())
NETWORK='AC Transit|East Bay'

class TransitTests(unittest.TestCase):
    def setUp(self):
        self.env=patch.dict(os.environ,{'TRANSIT_API_KEY':'test-only-secret'});self.env.start()
        transit._CALLS.clear();transit._DAY=None;transit._COUNT=0;transit._RETRY=0
    def tearDown(self):self.env.stop()
    def query(self):return {k:[v] for k,v in dict(from_lat='37.87',from_lon='-122.27',to_lat='37.87',to_lon='-122.25',max_walk='15',step_free='true',mode='now').items()}
    def test_transfer_walk_geometry_and_realtime_normalization(self):
        data=transit.normalize(FIXTURE,NETWORK,15,True)
        self.assertEqual(len(data),1);self.assertEqual([x['mode'] for x in data[0]['legs']],['walk','bus','walk','bus','walk'])
        self.assertEqual(data[0]['walk_minutes'],6)
        bus=data[0]['legs'][1];self.assertEqual(bus['route'],'51B');self.assertTrue(bus['realtime']);self.assertEqual(bus['stops'][0]['raw_id'],'a')
    def test_cancelled_wrong_network_unknown_stops_and_inaccessible_rejected(self):
        for mutate in [lambda r:r['legs'][1]['departures'][0].update(is_cancelled=True),lambda r:r['legs'][1]['routes'][0].update(route_network_id='Other'),lambda r:r['legs'][1]['routes'][0]['itineraries'][0].update(stops=[]),lambda r:r.update(accessibility='None')]:
            data=copy.deepcopy(FIXTURE);mutate(data['results'][0]);self.assertEqual(transit.normalize(data,NETWORK,15,True),[])
    def test_long_walk_rejected_and_scheduled_not_reported_live(self):
        data=copy.deepcopy(FIXTURE);data['results'][0]['legs'][0]['duration']=2000
        self.assertEqual(transit.normalize(data,NETWORK,15,False),[])
        data=copy.deepcopy(FIXTURE);data['results'][0]['legs'][1]['departures'][0]['plan_details']['arrival_schedule_item']['is_real_time']=False
        self.assertFalse(transit.normalize(data,NETWORK,15,False)[0]['legs'][1]['realtime'])
    def test_parameter_validation(self):
        for field,value in [('from_lat','nan'),('to_lon','181'),('max_walk','100'),('mode','other')]:
            q=self.query();q[field]=[value]
            with self.assertRaises(ValueError):transit.parameters(q)
    def test_plan_caches_discovery_and_results_and_passes_preferences(self):
        cache={};calls=[]
        def cached(key,ttl,fn):
            if key not in cache:cache[key]=fn()
            return cache[key]
        def request(path,params):
            calls.append((path,params))
            return {'networks':[{'network_name':'AC Transit','network_id':NETWORK}]} if path=='available_networks' else FIXTURE
        with patch.object(transit,'request',side_effect=request):
            a=transit.plan(self.query(),cached);b=transit.plan(self.query(),cached)
        self.assertTrue(a['available']);self.assertEqual(a,b);self.assertEqual(len(calls),1)
        self.assertEqual(calls[0][1]['should_use_walk_path_duration'],'true');self.assertEqual(calls[0][1]['num_result'],6);self.assertNotIn('allowed_networks',calls[0][1]);self.assertEqual(calls[0][1]['accessibility_need'],'strict')
        self.assertEqual(calls[0][1]['max_distance_between_location_and_stop'],1125)
    def test_upstream_failure_hides_secret_and_circuit_breaks(self):
        with patch.object(transit.urllib.request,'urlopen',side_effect=Exception('test-only-secret')) as upstream:
            for _ in range(2):
                with self.assertRaises(RuntimeError) as error:transit.request('plan',{})
                self.assertNotIn('test-only-secret',str(error.exception))
            self.assertEqual(upstream.call_count,1)
    def test_key_is_sent_in_header_and_minute_budget_is_enforced(self):
        class Response(io.BytesIO):
            def __enter__(self):return self
            def __exit__(self,*a):self.close()
        with patch.object(transit.urllib.request,'urlopen',side_effect=lambda *a,**kw:Response(b'{"results":[]}')) as upstream:
            for _ in range(4):transit.request('plan',{})
            with self.assertRaises(RuntimeError):transit.request('plan',{})
            self.assertEqual(upstream.call_count,4)
            req=upstream.call_args.args[0];self.assertNotIn('test-only-secret',req.full_url);self.assertEqual(req.get_header('Apikey'),'test-only-secret')
    def test_unconfigured_returns_safe_fallback(self):
        with patch.dict(os.environ,{'TRANSIT_API_KEY':''}):
            data=transit.plan(self.query(),lambda k,t,fn:fn());self.assertFalse(data['available'])

if __name__=='__main__':unittest.main()

class NationalTests(unittest.TestCase):
 def test_city_coordinates_and_foreign_network_normalization(self):
  for lat,lon in [(29.7604,-95.3698),(40.7128,-74.006),(21.3099,-157.8581),(61.2181,-149.9003)]:
   q={k:[str(v)] for k,v in dict(from_lat=lat,from_lon=lon,to_lat=lat+.01,to_lon=lon+.01).items()};self.assertEqual(transit.parameters(q)[0]['from_lat'],lat)
  raw=copy.deepcopy(FIXTURE)
  for leg in raw['results'][0]['legs']:
   for route in leg.get('routes',[]):route['route_network_id']='METRO|Houston'
  self.assertEqual(len(transit.normalize(raw,None,15,False)),1)
  self.assertEqual(transit.normalize(raw,None,15,False)[0]['legs'][1]['network_id'],'METRO|Houston')

class EmptyPlanTests(unittest.TestCase):
 def test_empty_plan_distinguishes_walking_accessibility_and_missing_departures(self):
  q={k:[str(v)] for k,v in dict(from_lat=35.36,from_lon=-118.92,to_lat=35.3375,to_lon=-119.0337,max_walk=5,mode='now').items()}
  with patch.dict(os.environ,{'TRANSIT_API_KEY':'test'}):
   with patch.object(transit,'request',return_value=FIXTURE):self.assertEqual(transit.plan(q,lambda k,t,fn:fn())['empty_reason'],'walking_limit');self.assertEqual(len(transit.plan(q,lambda k,t,fn:fn())['walking_options']),1)
   with patch.object(transit,'request',return_value={'results':[]}):self.assertEqual(transit.plan(q,lambda k,t,fn:fn())['empty_reason'],'no_departures')
