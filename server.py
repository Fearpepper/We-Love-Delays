#!/usr/bin/env python3
"""Local-only Berkeley bus prototype. Python standard library only."""
import csv, io, json, os, pathlib, threading, time, urllib.parse, urllib.request, zipfile
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
ROOT=pathlib.Path(__file__).resolve().parent
HOST=os.getenv('HOST','0.0.0.0'); PORT=int(os.getenv('PORT','10000'))
KEY=os.getenv('SF511_API_KEY','').strip()
CACHE={}; LOCK=threading.Lock()
def upstream(path, params, binary=False):
    if not KEY: raise RuntimeError('No 511 API token configured. See README.md.')
    query=urllib.parse.urlencode(dict(params,api_key=KEY))
    url='https://api.511.org/transit/'+path+'?'+query
    req=urllib.request.Request(url,headers={'User-Agent':'WeLoveDelays-Berkeley-StudentPrototype/1.0','Accept':'application/json, */*'})
    try:
        with urllib.request.urlopen(req,timeout=35) as r: raw=r.read(25_000_000)
    except Exception as exc: raise RuntimeError('511 request failed: '+str(exc)) from exc
    if binary:return raw
    try:return json.loads(raw.decode('utf-8-sig'))
    except Exception: raise RuntimeError('511 returned a non-JSON response.')
def cached(key,ttl,fn):
    with LOCK:
        if key in CACHE and time.time()-CACHE[key][0]<ttl:return CACHE[key][1]
    val=fn()
    with LOCK:CACHE[key]=(time.time(),val)
    return val
def places(query):
    """Search OSM locations near Berkeley, with a backup provider."""
    query=query.strip()
    if len(query)<3 or len(query)>100:raise ValueError('Enter 3–100 characters.')
    headers={'User-Agent':'WeLoveDelays/1.0 (student project; https://we-love-delays.onrender.com)','Accept':'application/json'}
    out=[]
    try:
        params=urllib.parse.urlencode({'q':query,'lat':37.8715,'lon':-122.2585,'limit':10,'lang':'en'})
        req=urllib.request.Request('https://photon.komoot.io/api/?'+params,headers=headers)
        with urllib.request.urlopen(req,timeout=6) as response:raw=json.load(response)
        for feature in raw.get('features',[]):
            prop=feature.get('properties') or {};coords=feature.get('geometry',{}).get('coordinates') or []
            if len(coords)<2:continue
            lon,lat=coords[:2]
            if not (37.3<=lat<=38.3 and -123.0<=lon<=-121.5):continue
            name=prop.get('name') or prop.get('street')
            if name:out.append({'name':name,'detail':', '.join(str(prop[k]) for k in ('street','city') if prop.get(k) and prop[k]!=name),'lat':lat,'lon':lon})
    except Exception:
        pass
    if out:return out[:8]
    try:
        params=urllib.parse.urlencode({'q':query,'format':'json','limit':8,'addressdetails':1,'viewbox':'-122.6,38.1,-122.0,37.6','bounded':1})
        req=urllib.request.Request('https://nominatim.openstreetmap.org/search?'+params,headers=headers)
        with urllib.request.urlopen(req,timeout=7) as response:raw=json.load(response)
        for item in raw:
            address=item.get('address') or {}
            out.append({'name':item.get('name') or item.get('display_name','').split(',')[0],'detail':', '.join(filter(None,[address.get('road'),address.get('city') or address.get('town')])),'lat':float(item['lat']),'lon':float(item['lon'])})
    except Exception as exc:
        raise RuntimeError('Place search providers are unavailable. Try an AC Transit stop name instead.') from exc
    return out[:8]
def gtfs():
    def get():
        raw=upstream('datafeeds',{'operator_id':'AC'},True)
        try:
            with zipfile.ZipFile(io.BytesIO(raw)) as z:
                def table(name):
                    try:
                        with z.open(name) as f:return list(csv.DictReader(io.TextIOWrapper(f,encoding='utf-8-sig')))
                    except KeyError:return []
                routes=table('routes.txt');stops=table('stops.txt');trips=table('trips.txt');stop_times=table('stop_times.txt')
        except zipfile.BadZipFile:raise RuntimeError('511 did not return a valid AC Transit GTFS ZIP.')
        routeids={r['route_id'] for r in routes if r.get('route_type','3') in ('3','')}; tripids={t['trip_id'] for t in trips if t.get('route_id') in routeids}
        bytrip={}
        for row in stop_times:
            if row.get('trip_id') in tripids:bytrip.setdefault(row['trip_id'],[]).append(row)
        for seq in bytrip.values():seq.sort(key=lambda x:int(x.get('stop_sequence') or 0))
        patterns={}
        for t in trips:
            seq=bytrip.get(t.get('trip_id'),[])
            if len(seq)<2 or t.get('route_id') not in routeids:continue
            ids=tuple(x['stop_id'] for x in seq)
            k=(t['route_id'],t.get('direction_id','0'),ids)
            if k not in patterns:patterns[k]={'route':t['route_id'],'direction':t.get('direction_id','0'),'headsign':t.get('trip_headsign',''),'stops':list(ids),'sample_trip':t['trip_id']}
        # Keep all distinct patterns to avoid inventing stop orders; truncate only very large route responses in browser.
        stopmap={s['stop_id']:{'id':s['stop_id'],'name':s.get('stop_name','Stop'), 'code':s.get('stop_code',''),'lat':num(s.get('stop_lat')),'lon':num(s.get('stop_lon'))} for s in stops if s.get('location_type','0') in ('','0')}
        return {'routes':[{'id':r['route_id'],'name':r.get('route_short_name') or r.get('route_long_name') or r['route_id'],'description':r.get('route_long_name','')} for r in routes if r['route_id'] in routeids and any(k[0]==r['route_id'] for k in patterns)], 'stops':stopmap,'patterns':list(patterns.values()),'updated':int(time.time())}
    return cached('gtfs',12*3600,get)
def num(x):
    try:return float(x)
    except (TypeError,ValueError):return None
def flatten_visits(obj):
    result=[]
    def walk(x):
        if isinstance(x,dict):
            for k,v in x.items():
                if k.lower()=='monitoredstopvisit':
                    result.extend(v if isinstance(v,list) else [v])
                else:walk(v)
        elif isinstance(x,list):
            for v in x:walk(v)
    walk(obj)
    out=[]
    for visit in result:
        if not isinstance(visit,dict):continue
        j=visit.get('MonitoredVehicleJourney') or {}
        if not isinstance(j,dict):continue
        call=j.get('MonitoredCall') or {}
        if not isinstance(call,dict):call={}
        out.append({'route':str(j.get('LineRef','')),'direction':str(j.get('DirectionRef','')),'destination':j.get('DestinationName',''), 'vehicle':j.get('VehicleRef',''), 'expected':call.get('ExpectedArrivalTime') or call.get('ExpectedDepartureTime'), 'aimed':call.get('AimedArrivalTime') or call.get('AimedDepartureTime'), 'recorded':visit.get('RecordedAtTime'),'stop':call.get('StopPointRef','')})
    return out
def arrivals(code):
    if not code or len(code)>30 or not all(c.isalnum() or c in '-_' for c in code):raise ValueError('Invalid stop code')
    return cached('arrival:'+code,65,lambda:flatten_visits(upstream('StopMonitoring',{'agency':'AC','stopCode':code,'format':'json'})))
class Handler(BaseHTTPRequestHandler):
    def log_message(self,fmt,*args):print('[web]',fmt%args)
    def respond(self,code,obj):
        data=json.dumps(obj,ensure_ascii=False).encode();self.send_response(code);self.send_header('Content-Type','application/json; charset=utf-8');self.send_header('Content-Length',str(len(data)));self.send_header('Cache-Control','no-store');self.end_headers();self.wfile.write(data)
    def do_GET(self):
        path=urllib.parse.urlsplit(self.path);q=urllib.parse.parse_qs(path.query)
        if path.path in ('/','/index.html'):
            data=(ROOT/'index.html').read_bytes();self.send_response(200);self.send_header('Content-Type','text/html; charset=utf-8');self.send_header('Content-Length',str(len(data)));self.send_header('Cache-Control','no-store');self.end_headers();self.wfile.write(data);return
        try:
            if path.path=='/api/status':return self.respond(200,{'configured':bool(KEY),'agency':'AC Transit','location':'Berkeley, California','local':False})
            if path.path=='/health':return self.respond(200,{'ok':True})
            if path.path=='/api/network':return self.respond(200,gtfs())
            if path.path=='/api/places':return self.respond(200,{'places':cached('places:'+q.get('q',[''])[0].lower(),300,lambda:places(q.get('q',[''])[0]))})
            if path.path=='/api/network/status':
                data=gtfs()
                return self.respond(200,{'ok':True,'routes':len(data['routes']),'patterns':len(data['patterns']),'stops':len(data['stops']),'updated':data['updated']})
            if path.path=='/api/arrivals':return self.respond(200,{'arrivals':arrivals(q.get('code',[''])[0]),'fetched':int(time.time())})
            return self.respond(404,{'error':'Not found'})
        except (RuntimeError,ValueError) as e:return self.respond(502,{'error':str(e)})
        except Exception as e:return self.respond(500,{'error':'Unexpected server error: '+str(e)})
if __name__=='__main__':
    print('We Love Delays — Berkeley web server')
    print('Listening on %s:%s'%(HOST,PORT))
    print('511 token:', 'configured' if KEY else 'MISSING (see README.md)')
    ThreadingHTTPServer((HOST,PORT),Handler).serve_forever()
