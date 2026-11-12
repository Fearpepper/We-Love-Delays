#!/usr/bin/env python3
"""Local-only Berkeley bus prototype. Python standard library only."""
import csv, datetime, io, json, math, os, pathlib, resource, sys, threading, time, urllib.parse, urllib.request, zipfile
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
ROOT=pathlib.Path(__file__).resolve().parent
HOST=os.getenv('HOST','0.0.0.0'); PORT=int(os.getenv('PORT','10000'))
KEY=os.getenv('SF511_API_KEY','').strip()
CACHE={}; INFLIGHT={}; LOCK=threading.Lock(); CACHE_SCHEDULE={}; GTFS_LOAD_LOCK=threading.Lock()
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
    # Share concurrent requests, including failures, rather than spend provider
    # quota once per browser or thread. Never hold the cache lock during I/O.
    with LOCK:
        if key in CACHE and time.time()-CACHE[key][0]<ttl:return CACHE[key][1]
        pending=INFLIGHT.get(key)
        owner=pending is None
        if owner:
            pending={'event':threading.Event()}
            INFLIGHT[key]=pending
    if not owner:
        if not pending['event'].wait(120):raise RuntimeError('Transit data is taking too long. Please retry.')
        if 'error' in pending:raise pending['error']
        return pending['value']
    try:
        val=fn()
        with LOCK:
            if len(CACHE)>160:
                oldest=sorted((k for k in CACHE if k!='gtfs'),key=lambda k:CACHE[k][0])
                for k in oldest[:max(0,len(CACHE)-120)]:CACHE.pop(k,None)
            CACHE[key]=(time.time(),val)
            pending['value']=val
        return val
    except BaseException as exc:
        pending['error']=exc
        raise
    finally:
        with LOCK:
            INFLIGHT.pop(key,None)
            pending['event'].set()


def normalize_alerts(payload):
    """Normalize GTFS-RT JSON while preserving selector AND semantics."""
    if not isinstance(payload,dict) or not isinstance(payload.get('entity'),list):
        raise RuntimeError('511 returned an unsupported service-alert feed.')
    def field(obj,snake,camel):return obj.get(snake,obj.get(camel))
    def text(value):
        if not isinstance(value,dict):return ''
        rows=[x for x in value.get('translation',[]) if isinstance(x,dict) and isinstance(x.get('text'),str)]
        chosen=next((x for x in rows if x.get('language','en').lower().startswith('en')),rows[0] if rows else {})
        return chosen.get('text','')[:6000]
    def periods(rows):
        result=[]
        for row in rows or []:
            if not isinstance(row,dict):continue
            try:
                start=int(row['start']) if row.get('start') else None
                end=int(row['end']) if row.get('end') else None
                result.append({'start':start,'end':end})
            except (TypeError,ValueError):continue
        return result
    out=[]
    for entity in payload['entity']:
        if not isinstance(entity,dict) or entity.get('is_deleted',entity.get('isDeleted',False)):continue
        alert=entity.get('alert')
        if not isinstance(alert,dict):continue
        title=text(field(alert,'header_text','headerText'))
        description=text(field(alert,'description_text','descriptionText'))
        if not title and not description:continue
        selectors=[]
        for item in field(alert,'informed_entity','informedEntity') or []:
            if not isinstance(item,dict):continue
            trip=item.get('trip') or {}
            selectors.append({'route':str(field(item,'route_id','routeId') or field(trip,'route_id','routeId') or ''),
                              'stop':str(field(item,'stop_id','stopId') or ''),
                              'direction':field(item,'direction_id','directionId') if field(item,'direction_id','directionId') is not None else field(trip,'direction_id','directionId'),
                              'trip':str(field(trip,'trip_id','tripId') or '')})
        url=text(alert.get('url'))
        if urllib.parse.urlsplit(url).scheme not in ('https','http'):url=''
        out.append({'id':str(entity.get('id','')),'title':title or 'Service update','description':description,
                    'url':url,'selectors':selectors,'effect':str(alert.get('effect','UNKNOWN_EFFECT')),
                    'periods':periods(field(alert,'communication_period','communicationPeriod') or field(alert,'active_period','activePeriod'))})
    return {'alerts':out,'fetched':int(time.time()),'source':'511 / AC Transit'}

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
def memory_mb():
    # Linux ru_maxrss is KiB; reports peak resident memory without paid metrics.
    return round(resource.getrusage(resource.RUSAGE_SELF).ru_maxrss/1024,1)
def gtfs():
    def get():
        print('[memory] GTFS load started; peak RSS:',memory_mb(),'MB',flush=True)
        raw=upstream('datafeeds',{'operator_id':'AC'},True)
        try:
            with zipfile.ZipFile(io.BytesIO(raw)) as z:
                def table(name):
                    try:
                        with z.open(name) as f:return list(csv.DictReader(io.TextIOWrapper(f,encoding='utf-8-sig')))
                    except KeyError:return []
                routes=table('routes.txt');stops=table('stops.txt');trips=table('trips.txt');calendar=table('calendar.txt');exceptions=table('calendar_dates.txt')
                routeids={r['route_id'] for r in routes if r.get('route_type','3') in ('3','')}
                tripids={t['trip_id'] for t in trips if t.get('route_id') in routeids}
                bytrip={}
                # Stream stop_times.txt: avoid retaining the entire CSV as dictionaries.
                with z.open('stop_times.txt') as stream:
                    for row in csv.DictReader(io.TextIOWrapper(stream,encoding='utf-8-sig')):
                        tid=row.get('trip_id')
                        if tid in tripids:
                            bytrip.setdefault(tid,[]).append((int(row.get('stop_sequence') or 0),row.get('stop_id',''),row.get('arrival_time',''),row.get('departure_time','')))
                for seq in bytrip.values():seq.sort(key=lambda row:row[0])
        except zipfile.BadZipFile:raise RuntimeError('511 did not return a valid AC Transit GTFS ZIP.')

        patterns={}
        for t in trips:
            seq=bytrip.get(t.get('trip_id'),[])
            if len(seq)<2 or t.get('route_id') not in routeids:continue
            ids=tuple(x[1] for x in seq)
            k=(t['route_id'],t.get('direction_id','0'),ids)
            if k not in patterns:patterns[k]={'route':t['route_id'],'direction':t.get('direction_id','0'),'headsign':t.get('trip_headsign',''),'stops':list(ids),'sample_trip':t['trip_id']}
        # Keep all distinct patterns to avoid inventing stop orders; truncate only very large route responses in browser.
        # Preserve scheduled stop times for each published pattern; filter by service calendar at request time.
        schedule={}
        for t in trips:
            tid=t.get('trip_id');seq=bytrip.get(tid,[])
            if len(seq)<2 or t.get('route_id') not in routeids:continue
            key=(t['route_id'],t.get('direction_id','0'),tuple(x[1] for x in seq))
            entry=patterns.get(key)
            if entry is None:continue
            schedule.setdefault(entry['sample_trip'],[]).append((t.get('service_id',''),tuple((row[2] or row[3],row[3] or row[2]) for row in seq)))
        # Compact immutable schedule entries avoid thousands of nested dictionaries.
        CACHE_SCHEDULE.clear()
        CACHE_SCHEDULE.update({'trips':schedule,'calendar':calendar,'exceptions':exceptions})
        active_routeids={k[0] for k in patterns}
        stopmap={s['stop_id']:{'id':s['stop_id'],'name':s.get('stop_name','Stop'), 'code':s.get('stop_code',''),'lat':num(s.get('stop_lat')),'lon':num(s.get('stop_lon'))} for s in stops if s.get('location_type','0') in ('','0')}
        print('[memory] GTFS parsed; peak RSS:',memory_mb(),'MB; trips:',len(bytrip),'patterns:',len(patterns),flush=True)
        return {'routes':[{'id':r['route_id'],'name':r.get('route_short_name') or r.get('route_long_name') or r['route_id'],'description':r.get('route_long_name','')} for r in routes if r['route_id'] in routeids and r['route_id'] in active_routeids], 'stops':stopmap,'patterns':list(patterns.values()),'updated':int(time.time())}
    return cached('gtfs',12*3600,get)
def scheduled_journey(sample_trip,board,exit,at=None):
    data=gtfs()
    pattern=next((p for p in data['patterns'] if p.get('sample_trip')==sample_trip),None)
    if not pattern:raise ValueError('Unknown published trip pattern')
    if not (0<=board<exit<len(pattern['stops'])):raise ValueError('Invalid boarding or exit stop')
    # Use America/Los_Angeles for DST-aware service dates.
    from zoneinfo import ZoneInfo
    now=datetime.datetime.now(ZoneInfo('America/Los_Angeles'))
    if at:
        try:now=datetime.datetime.fromisoformat(at).astimezone(ZoneInfo('America/Los_Angeles'))
        except (ValueError,TypeError):raise ValueError('Invalid departure date/time')
    def seconds(value):
        try:
            h,m,sec=map(int,value.split(':'))
            if h<0 or not 0<=m<60 or not 0<=sec<60:return None
            return h*3600+m*60+sec
        except (ValueError,AttributeError):return None
    calendar={x.get('service_id'):x for x in CACHE_SCHEDULE.get('calendar',[])}
    exceptions={}
    for row in CACHE_SCHEDULE.get('exceptions',[]):
        exceptions[(row.get('service_id'),row.get('date'))]=row.get('exception_type')
    results=[]
    for offset in (-1,0,1):
        day=(now+datetime.timedelta(days=offset)).date()
        date=day.strftime('%Y%m%d')
        for trip in CACHE_SCHEDULE.get('trips',{}).get(sample_trip,[]):
            service=trip[0]
            exception=exceptions.get((service,date))
            cal=calendar.get(service)
            active=exception=='1' or (exception!='2' and cal is not None and cal.get('start_date','')<=date<=cal.get('end_date','') and cal.get(day.strftime('%A').lower())=='1')
            if not active:continue
            rows=trip[1]
            departure=seconds(rows[board][1]);arrival=seconds(rows[exit][0])
            if departure is None or arrival is None or arrival<departure:continue
            midnight=datetime.datetime.combine(day,datetime.time(),ZoneInfo('America/Los_Angeles'))
            start=midnight+datetime.timedelta(seconds=departure)
            end=midnight+datetime.timedelta(seconds=arrival)
            if start<now-datetime.timedelta(minutes=2) or start>now+datetime.timedelta(hours=24):continue
            results.append({'departure':start.isoformat(),'arrival':end.isoformat(),'ride_minutes':round((end-start).total_seconds()/60,1),'source':'GTFS scheduled, not live'})
    results.sort(key=lambda x:x['departure'])
    return {'trips':results[:12],'source':'511 AC Transit GTFS','timezone':'America/Los_Angeles'}

def pedestrian_route(a_lat,a_lon,b_lat,b_lon,profile='foot-walking'):
    """OpenRouteService pedestrian routing; unavailable rather than inventing a walk."""
    key=os.getenv('ORS_API_KEY','').strip()
    if not key:raise RuntimeError('Pedestrian routing is not configured (ORS_API_KEY missing).')
    if profile not in ('foot-walking','wheelchair'):raise ValueError('Unsupported pedestrian profile')
    coords=[a_lat,a_lon,b_lat,b_lon]
    if not all(math.isfinite(v) and -180<=v<=180 for v in coords):raise ValueError('Invalid coordinates')
    if not all(37.0<=v<=38.5 for v in (a_lat,b_lat)) or not all(-123.5<=v<=-121.0 for v in (a_lon,b_lon)):
        raise ValueError('Pedestrian routing currently supports the East Bay area')
    # POST GeoJSON is the documented directions endpoint and avoids GET content-negotiation issues.
    url='https://api.heigit.org/openrouteservice/v2/directions/'+profile+'/geojson'
    body=json.dumps({'coordinates':[[a_lon,a_lat],[b_lon,b_lat]]}).encode('utf-8')
    req=urllib.request.Request(url,data=body,method='POST',headers={
        'Authorization':key,'Accept':'application/geo+json',
        'Content-Type':'application/json','User-Agent':'WeLoveDelays/1.0'
    })
    try:
        with urllib.request.urlopen(req,timeout=18) as response:payload=json.load(response)
        features=payload.get('features') or []
        if not features:raise ValueError('No pedestrian route available')
        feature=features[0];summary=(feature.get('properties') or {}).get('summary') or {}
        geometry=feature.get('geometry') or {}
        seconds=float(summary['duration']);meters=float(summary['distance'])
        if not (math.isfinite(seconds) and math.isfinite(meters) and 0<=seconds<=86400 and 0<=meters<=100000):
            raise ValueError('Invalid pedestrian route metrics')
        path=geometry.get('coordinates') or []
        if geometry.get('type')!='LineString' or not isinstance(path,list) or not 2<=len(path)<=10000:
            raise ValueError('Invalid ORS pedestrian route geometry')
        if any(not isinstance(p,list) or len(p)<2 or not all(isinstance(v,(int,float)) and math.isfinite(v) for v in p[:2]) or not (-180<=p[0]<=180 and -90<=p[1]<=90) for p in path):
            raise ValueError('Invalid ORS pedestrian route coordinates')
        # ORS occasionally snaps to a distant path. Do not show a line starting or
        # ending far away from the chosen stop/place as though it were a valid walk.
        def endpoint_gap(p,lat,lon):
            return math.hypot((p[1]-lat)*111320,(p[0]-lon)*111320*math.cos(math.radians(lat)))
        if endpoint_gap(path[0],a_lat,a_lon)>350 or endpoint_gap(path[-1],b_lat,b_lon)>350:
            raise ValueError('Pedestrian path starts or ends too far from the selected location')
        return {'available':True,'minutes':round(seconds/60,1),'meters':round(meters),'geometry':geometry,'source':'OpenRouteService '+profile,'accessibility_verified':False}
    except urllib.error.HTTPError as exc:
        detail=exc.read(1200).decode('utf-8','replace')
        raise RuntimeError('Pedestrian route provider HTTP '+str(exc.code)+': '+detail[:400]) from exc
    except (KeyError,IndexError,TypeError,ValueError,urllib.error.URLError) as exc:
        raise RuntimeError('Pedestrian route unavailable: '+str(exc)) from exc

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
    return cached('arrival:'+code,120,lambda:flatten_visits(upstream('StopMonitoring',{'agency':'AC','stopCode':code,'format':'json'})))
class Handler(BaseHTTPRequestHandler):
    def log_message(self,fmt,*args):print('[web]',fmt%args)
    def respond(self,code,obj):
        data=json.dumps(obj,ensure_ascii=False,separators=(',',':')).encode()
        try:
            self.send_response(code)
            self.send_header('Content-Type','application/json; charset=utf-8')
            self.send_header('Content-Length',str(len(data)))
            self.send_header('Cache-Control','no-store')
            self.end_headers()
            self.wfile.write(data)
        except (BrokenPipeError,ConnectionResetError,ConnectionAbortedError):
            # Client disconnected before the response finished. Not a server failure.
            return
    def do_HEAD(self):
        # Lightweight health check: respond without loading GTFS or sending a body.
        path=urllib.parse.urlsplit(self.path).path
        if path in ('/','/index.html','/health'):
            self.send_response(200)
            self.send_header('Content-Type','text/html; charset=utf-8' if path!='/health' else 'application/json; charset=utf-8')
            self.send_header('Content-Length','0')
            self.send_header('Cache-Control','no-store')
            self.end_headers()
        else:
            self.send_response(404)
            self.send_header('Content-Length','0')
            self.end_headers()
    def do_GET(self):
        path=urllib.parse.urlsplit(self.path);q=urllib.parse.parse_qs(path.query)
        if path.path in ('/assets/app.css','/assets/design.css','/assets/app.js','/assets/navigation.js','/assets/dashboard.js','/assets/guide.js','/assets/experience.js','/assets/focus.js','/assets/reliability.js','/assets/alerts.js'):
            assets={'/assets/app.css':'text/css; charset=utf-8','/assets/design.css':'text/css; charset=utf-8','/assets/app.js':'text/javascript; charset=utf-8','/assets/navigation.js':'text/javascript; charset=utf-8','/assets/dashboard.js':'text/javascript; charset=utf-8','/assets/guide.js':'text/javascript; charset=utf-8','/assets/experience.js':'text/javascript; charset=utf-8','/assets/focus.js':'text/javascript; charset=utf-8','/assets/reliability.js':'text/javascript; charset=utf-8','/assets/alerts.js':'text/javascript; charset=utf-8'}
            data=(ROOT/path.path.lstrip('/')).read_bytes()
            self.send_response(200)
            self.send_header('Content-Type',assets[path.path])
            self.send_header('Content-Length',str(len(data)))
            self.send_header('Cache-Control','no-cache')
            self.end_headers()
            try:self.wfile.write(data)
            except (BrokenPipeError,ConnectionResetError,ConnectionAbortedError):pass
            return
        if path.path in ('/manifest.webmanifest','/sw.js','/icon.svg'):
            assets={'/manifest.webmanifest':('manifest.webmanifest','application/manifest+json'),'/sw.js':('sw.js','text/javascript; charset=utf-8'),'/icon.svg':('icon.svg','image/svg+xml')}
            name,mime=assets[path.path]
            data=(ROOT/name).read_bytes()
            self.send_response(200)
            self.send_header('Content-Type',mime)
            self.send_header('Content-Length',str(len(data)))
            self.send_header('Cache-Control','no-cache')
            if path.path=='/sw.js':self.send_header('Service-Worker-Allowed','/')
            self.end_headers()
            self.wfile.write(data)
            return
        if path.path in ('/','/index.html'):
            data=(ROOT/'index.html').read_bytes();self.send_response(200);self.send_header('Content-Type','text/html; charset=utf-8');self.send_header('Content-Length',str(len(data)));self.send_header('Cache-Control','no-store');self.end_headers();self.wfile.write(data);return
        try:
            if path.path=='/api/alerts':return self.respond(200,cached('alerts:AC',600,lambda:normalize_alerts(upstream('servicealerts',{'agency':'AC','format':'json'}))))
            if path.path=='/api/status':return self.respond(200,{'configured':bool(KEY),'agency':'AC Transit','location':'Berkeley, California','local':False})
            if path.path=='/health':return self.respond(200,{'ok':True})
            if path.path=='/api/network':return self.respond(200,gtfs())
            if path.path=='/api/places':return self.respond(200,{'places':cached('places:'+q.get('q',[''])[0].lower(),300,lambda:places(q.get('q',[''])[0]))})
            if path.path=='/api/network/status':
                data=gtfs()
                return self.respond(200,{'ok':True,'routes':len(data['routes']),'patterns':len(data['patterns']),'stops':len(data['stops']),'updated':data['updated']})
            if path.path=='/api/walk-route':
                a_lat=float(q.get('from_lat',['nan'])[0]);a_lon=float(q.get('from_lon',['nan'])[0])
                b_lat=float(q.get('to_lat',['nan'])[0]);b_lon=float(q.get('to_lon',['nan'])[0])
                profile=q.get('profile',['foot-walking'])[0]
                # A trip can request the same pedestrian leg many times (rank, Guide,
                # map). Cache provider results briefly to respect API quotas.
                key='walk:'+':'.join(f'{x:.6f}' for x in (a_lat,a_lon,b_lat,b_lon))+':'+profile
                return self.respond(200,cached(key,300,lambda:pedestrian_route(a_lat,a_lon,b_lat,b_lon,profile)))
            if path.path=='/api/scheduled-journey':return self.respond(200,scheduled_journey(q.get('trip',[''])[0],int(q.get('board',['-1'])[0]),int(q.get('exit',['-1'])[0])))
            if path.path=='/api/arrivals':return self.respond(200,{'arrivals':arrivals(q.get('code',[''])[0]),'fetched':int(time.time())})
            return self.respond(404,{'error':'Not found'})
        except ValueError as e:return self.respond(400,{'error':str(e)})
        except RuntimeError as e:return self.respond(502,{'error':str(e)})
        except (BrokenPipeError,ConnectionResetError,ConnectionAbortedError):
            return
        except Exception as e:
            print('[server error]',repr(e))
            return self.respond(500,{'error':'Unexpected server error. Please try again.'})
if __name__=='__main__':
    print('We Love Delays — Berkeley web server')
    print('Listening on %s:%s'%(HOST,PORT))
    print('511 token:', 'configured' if KEY else 'MISSING (see README.md)')
    print('[memory] startup peak RSS:',memory_mb(),'MB',flush=True)
    ThreadingHTTPServer((HOST,PORT),Handler).serve_forever()
