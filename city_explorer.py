"""Bounded nearby transit and named places; credentials stay in the Transit adapter."""
import concurrent.futures, json, math, urllib.parse, urllib.request
import transit_provider as transit

POOL=concurrent.futures.ThreadPoolExecutor(max_workers=4)
HEADERS={'User-Agent':'WeLoveDelays/1.0 (https://we-love-delays.onrender.com)','Accept':'application/json'}

def coordinates(q):
    lat,lon=(float(q.get(k,['nan'])[0]) for k in ('lat','lon'))
    if not all(math.isfinite(x) for x in (lat,lon)) or not -90<=lat<=90 or not -180<=lon<=180:raise ValueError('Choose a valid map area.')
    return round(lat,3),round(lon,3)

def meters(lat,lon,a,b):
    return math.hypot((a-lat)*111195,(b-lon)*111195*math.cos(math.radians(lat)))

def get_json(url,data=None):
    req=urllib.request.Request(url,data=data,headers=HEADERS)
    with urllib.request.urlopen(req,timeout=10) as response:
        raw=response.read(2_000_001)
    if len(raw)>2_000_000:raise ValueError('Nearby response too large')
    return json.loads(raw)

def area(lat,lon):
    raw=get_json('https://photon.komoot.io/reverse?'+urllib.parse.urlencode({'lat':lat,'lon':lon,'limit':1,'lang':'en'}))
    features=raw.get('features') or []
    p=features[0].get('properties',{}) if features else {}
    city=p.get('city') or p.get('town') or p.get('village') or p.get('locality') or p.get('county')
    state=p.get('state')
    return ', '.join(str(x)[:100] for x in (city,state) if x) or 'This map area'

def nearby_transit(lat,lon):
    if not transit.configured():raise RuntimeError('Transit unavailable')
    raw=transit.request('nearby_routes',{'lat':lat,'lon':lon,'max_distance':1500})
    if not isinstance(raw.get('nearby_routes'),list):raise ValueError('Invalid nearby routes')
    stops={}
    for route in raw['nearby_routes'][:80]:
        if not isinstance(route,dict):continue
        mode,label=transit.transport(route)
        info={'id':str(route.get('global_route_id',''))[:180],
              'name':str(route.get('route_short_name') or route.get('route_long_name') or label)[:100],
              'agency':str(route.get('route_network_name',''))[:100],'mode':label}
        for itinerary in (route.get('merged_itineraries') or [])[:10]:
            if not isinstance(itinerary,dict):continue
            s=transit.stop(itinerary.get('closest_stop'))
            if not s or not s['id'] or meters(lat,lon,s['lat'],s['lon'])>1700:continue
            if s['id'] not in stops:stops[s['id']]=dict(s,routes=[],source='Transit')
            if info not in stops[s['id']]['routes']:stops[s['id']]['routes'].append(info)
    return sorted(stops.values(),key=lambda s:meters(lat,lon,s['lat'],s['lon']))[:16]

def nearby_places(lat,lon):
    around=f'(around:2500,{lat},{lon})'
    query='[out:json][timeout:8];('+''.join('nwr'+around+tag+'[name];' for tag in (
        '[amenity~"^(cafe|restaurant|library|cinema|theatre)$"]','[shop~"^(mall|department_store|supermarket)$"]',
        '[leisure=park]','[tourism~"^(attraction|museum)$"]','[highway=bus_stop]','[railway=station]','[public_transport=platform]'))+');out center 180;'
    raw=get_json('https://overpass-api.de/api/interpreter',urllib.parse.urlencode({'data':query}).encode())
    if not isinstance(raw.get('elements'),list) or raw.get('remark'):raise ValueError('Nearby map data incomplete')
    places=[];stops=[];seen=set()
    for el in raw['elements']:
        tags=el.get('tags') or {};name=tags.get('name');center=el.get('center') or el
        a,b=center.get('lat'),center.get('lon')
        if not isinstance(name,str) or not all(transit.number(x) for x in (a,b)) or not -90<=a<=90 or not -180<=b<=180 or meters(lat,lon,a,b)>2700:continue
        identity=(name.casefold(),round(a,4),round(b,4))
        if identity in seen:continue
        seen.add(identity)
        item={'id':str(el.get('type'))+':'+str(el.get('id')),'name':name[:200],'lat':a,'lon':b,'source':'OpenStreetMap'}
        if tags.get('highway')=='bus_stop' or tags.get('railway')=='station' or tags.get('public_transport')=='platform':
            if meters(lat,lon,a,b)<=1700:stops.append(dict(item,routes=[]))
        else:
            category='cafe' if tags.get('amenity') in ('cafe','restaurant') else 'shopping' if tags.get('shop') else 'places'
            places.append(dict(item,category=category,detail=str(tags.get('amenity') or tags.get('shop') or tags.get('tourism') or 'park').replace('_',' ').capitalize()))
    places.sort(key=lambda s:meters(lat,lon,s['lat'],s['lon']))
    # Keep each category represented without letting restaurants fill every slot.
    chosen=[]
    for category in ('cafe','shopping','places'):chosen.extend([p for p in places if p['category']==category][:6])
    return {'places':chosen,'stops':sorted(stops,key=lambda s:meters(lat,lon,s['lat'],s['lon']))[:12]}

def explore(lat,lon):
    jobs={k:POOL.submit(fn,lat,lon) for k,fn in (('area',area),('transit',nearby_transit),('places',nearby_places))}
    result={'area':'This map area','stops':[],'places':[],'transit_available':False,'places_available':False}
    for key,job in jobs.items():
        try:
            value=job.result(timeout=17)
            if key=='area':result['area']=value
            elif key=='transit':result.update(stops=value,transit_available=True)
            else:
                result.update(places=value['places'],places_available=True)
                if not result['transit_available']:result['stops']=value['stops']
        except Exception:pass
    return result
