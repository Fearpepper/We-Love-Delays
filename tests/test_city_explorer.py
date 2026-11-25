import unittest
from unittest.mock import patch
import city_explorer as explorer
import transit_provider as transit

class ExplorerTests(unittest.TestCase):
    def test_coordinates_validate_and_round_area(self):
        self.assertEqual(explorer.coordinates({'lat':['35.36054'],'lon':['-118.91412']}),(35.361,-118.914))
        for lat,lon in [('nan','0'),('91','0'),('0','181'),('0','inf')]:
            with self.assertRaises(ValueError):explorer.coordinates({'lat':[lat],'lon':[lon]})
    def test_transit_groups_closest_stops_and_preserves_local_agencies(self):
        stop={'global_stop_id':'GET:1','stop_name':'Foothill','stop_lat':35.361,'stop_lon':-118.914}
        route={'global_route_id':'GET:route','route_short_name':'21','route_network_name':'GET Bus','route_type':3,'merged_itineraries':[{'closest_stop':stop},{'closest_stop':stop}]}
        with patch.object(transit,'configured',return_value=True),patch.object(transit,'request',return_value={'nearby_routes':[route]}) as request:
            stops=explorer.nearby_transit(35.361,-118.914)
        self.assertEqual(len(stops),1);self.assertEqual(stops[0]['routes'][0]['agency'],'GET Bus');self.assertEqual(stops[0]['routes'][0]['mode'],'Bus')
        self.assertEqual(request.call_args.args[0],'nearby_routes');self.assertEqual(request.call_args.args[1]['max_distance'],1500)
    def test_places_validate_distance_dedupe_and_categories(self):
        def node(i,name,tags,lat=35.361):
            key,value=next(iter(tags.items()));return {'geometry':{'coordinates':[-118.914,lat]},'properties':{'osm_type':'N','osm_id':i,'name':name,'osm_key':key,'osm_value':value}}
        raw={'features':[node(1,'Coffee',{'amenity':'cafe'}),node(2,'Coffee',{'amenity':'cafe'}),node(3,'Mall',{'shop':'mall'}),node(4,'Park',{'leisure':'park'}),node(5,'Distant',{'shop':'mall'},40),node(6,'Station',{'railway':'station'})]}
        with patch.object(explorer,'get_json',return_value=raw):data=explorer.nearby_places(35.361,-118.914)
        self.assertEqual([p['category'] for p in data['places']],['cafe','shopping','places']);self.assertEqual(len(data['stops']),1)
    def test_partial_failure_keeps_places_and_osm_stops(self):
        with patch.object(explorer,'area',return_value='Bakersfield, California'),patch.object(explorer,'nearby_transit',side_effect=RuntimeError('private error')),patch.object(explorer,'nearby_places',return_value={'places':[{'name':'Mall'}],'stops':[{'name':'Stop'}]}):data=explorer.explore(35.361,-118.914)
        self.assertEqual(data['area'],'Bakersfield, California');self.assertFalse(data['transit_available']);self.assertTrue(data['places_available']);self.assertEqual(data['stops'][0]['name'],'Stop');self.assertNotIn('private',str(data))
    def test_transit_empty_success_is_not_replaced_with_osm_stops(self):
        with patch.object(explorer,'area',side_effect=RuntimeError()),patch.object(explorer,'nearby_transit',return_value=[]),patch.object(explorer,'nearby_places',return_value={'places':[],'stops':[{'name':'OSM'}]}):data=explorer.explore(0,0)
        self.assertEqual(data['stops'],[]);self.assertTrue(data['transit_available'])
    def test_nearby_quota_preserves_planner_allowance(self):
        with patch.object(transit,'_COUNT',20),patch.object(transit,'_DAY',int(transit.time.time()//86400)),patch.dict(transit.os.environ,{'TRANSIT_API_KEY':'fixture'}):
            with self.assertRaisesRegex(RuntimeError,'planning remains'):transit.request('nearby_routes',{'lat':35,'lon':-119})

if __name__=='__main__':unittest.main()
