import io,json,os,unittest
from unittest.mock import patch
import crowd,server
class FeedbackTests(unittest.TestCase):
 def setUp(self):crowd.SESSIONS.clear()
 def test_global_place_search_uses_requested_area_without_berkeley_boundary(self):
  requests=[]
  payload={'features':[{'properties':{'name':'Local Cafe','city':'Houston'},'geometry':{'coordinates':[-95.3698,29.7604]}}]}
  def fetch(req,timeout):requests.append(req);return io.BytesIO(json.dumps(payload).encode())
  with patch.dict(os.environ,{'ORS_API_KEY':'test'}),patch.dict(server.PLACE_RETRY,{},clear=True),patch('urllib.request.urlopen',side_effect=fetch):
   result=server.places('cafe',(29.7604,-95.3698),'Houston, TX')
  self.assertEqual(result[0]['lat'],29.7604);self.assertIn('Houston',result[0]['detail']);self.assertIn('Houston',requests[0].full_url);self.assertNotIn('boundary.rect',requests[0].full_url);self.assertNotIn('bbox=',requests[1].full_url);self.assertIn('29.7604',requests[0].full_url)
 def test_rider_sessions_count_deduplicate_move_and_expire(self):
  token='a'*24
  with patch('crowd.time.time',return_value=1000):
   self.assertEqual(crowd.update(token,'51B',True)['count'],1);self.assertEqual(crowd.update(token,'51B',True)['count'],1)
   crowd.update(token,'6',True);self.assertEqual(crowd.count('51B')['count'],0);self.assertEqual(crowd.count('6')['count'],1)
  with patch('crowd.time.time',return_value=1101):self.assertEqual(crowd.count('6')['count'],0)
 def test_rider_opt_out_and_input_validation(self):
  token='b'*24;crowd.update(token,'51B',True);self.assertEqual(crowd.update(token,'51B',False)['count'],0)
  with self.assertRaises(ValueError):crowd.update('short','51B',True)
  with self.assertRaises(ValueError):crowd.update(token,'x'*100,True)
