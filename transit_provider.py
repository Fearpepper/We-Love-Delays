"""Server-side Transit v4 adapter. Never exposes credentials or upstream error bodies."""
import json, math, os, threading, time, urllib.error, urllib.parse, urllib.request

_LOCK=threading.Lock()
_CALLS=[]
_DAY=None
_COUNT=0
_RETRY=0


def configured():
    return bool(os.getenv('TRANSIT_API_KEY','').strip())


def request(path, params):
    global _DAY, _COUNT, _RETRY
    key=os.getenv('TRANSIT_API_KEY','').strip()
    if not key:raise RuntimeError('Transit is not configured.')
    now=time.time()
    with _LOCK:
        day=int(now//86400)
        if day!=_DAY:_DAY=day;_COUNT=0
        _CALLS[:]=[t for t in _CALLS if now-t<60]
        if now<_RETRY or len(_CALLS)>=4 or _COUNT>=45:
            raise RuntimeError('Transit request allowance reached. Try again shortly or use external transit directions.')
        _CALLS.append(now);_COUNT+=1
    req=urllib.request.Request('https://external.transitapp.com/v4/public/'+path+'?'+urllib.parse.urlencode(params),
        headers={'apiKey':key,'Accept':'application/json','User-Agent':'WeLoveDelays/1.0'})
    try:
        with urllib.request.urlopen(req,timeout=15) as response:
            data=json.loads(response.read(4_000_000))
        if not isinstance(data,dict):raise ValueError('Invalid response')
        return data
    except urllib.error.HTTPError as exc:
        with _LOCK:_RETRY=now+(300 if exc.code in (401,403) else 60)
        raise RuntimeError('Transit request failed (HTTP '+str(exc.code)+'). Try again or use external transit directions.') from None
    except Exception:
        with _LOCK:_RETRY=now+60
        raise RuntimeError('Transit is temporarily unavailable. Try again shortly or use external transit directions.') from None


def number(v):
    return isinstance(v,(int,float)) and not isinstance(v,bool) and math.isfinite(v)


def stop(raw):
    if not isinstance(raw,dict):return None
    lat,lon=raw.get('stop_lat'),raw.get('stop_lon')
    if not number(lat) or not number(lon) or not -90<=lat<=90 or not -180<=lon<=180:return None
    return {'id':str(raw.get('global_stop_id',''))[:180], 'name':str(raw.get('stop_name','Bus stop'))[:200],
            'lat':lat,'lon':lon,'raw_id':str(raw.get('raw_stop_id',''))[:180], 'code':str(raw.get('stop_code',''))[:80]}


def normalize(raw,network_id,max_walk,step_free):
    if not isinstance(raw.get('results'),list):raise RuntimeError('Transit returned an invalid trip plan.')
    results=[]
    for result in raw['results'][:10]:
        if not isinstance(result,dict) or not all(number(result.get(k)) for k in ('start_time','end_time','duration')):continue
        if result['end_time']<result['start_time'] or result['duration']<0:continue
        if step_free and result.get('accessibility')!='WheelchairStrict':continue
        legs=[];walk_total=0;valid=True
        for leg in result.get('legs',[])[:30]:
            if not isinstance(leg,dict) or not all(number(leg.get(k)) for k in ('start_time','end_time','duration')):valid=False;break
            if leg['duration']<0 or leg['end_time']<leg['start_time']:valid=False;break
            base={k:leg[k] for k in ('start_time','end_time','duration')}
            if leg.get('leg_mode')=='walk':
                if leg['duration']>max_walk*60 or not number(leg.get('distance')) or leg['distance']<0:valid=False;break
                walk_total+=leg['duration']
                base.update(mode='walk',distance=leg['distance'],polyline=str(leg.get('polyline',''))[:100000],directions=[str(d.get('instruction',''))[:500] for d in leg.get('directions',[])[:80] if isinstance(d,dict) and d.get('instruction')])
            elif leg.get('leg_mode')=='transit':
                chosen=None
                for departure in leg.get('departures',[]):
                    if not isinstance(departure,dict) or departure.get('is_cancelled'):continue
                    detail=departure.get('plan_details') or {}
                    arrival=detail.get('arrival_schedule_item') or {}
                    if arrival.get('is_cancelled'):continue
                    routes=[r for r in leg.get('routes',[]) if isinstance(r,dict) and r.get('global_route_id')==detail.get('global_route_id') and (network_id is None or r.get('route_network_id')==network_id)]
                    if not routes:continue
                    route=routes[0]
                    itineraries=[it for it in route.get('itineraries',[]) if isinstance(it,dict) and (it.get('plan_details') or {}).get('internal_itinerary_id')==detail.get('internal_itinerary_id')]
                    if not itineraries:continue
                    itinerary=itineraries[0];available={s['id']:s for s in (stop(x) for x in itinerary.get('stops',[])) if s and s['id']}
                    ids=[str(x.get('global_stop_id','')) for x in detail.get('stop_schedule_items',[]) if isinstance(x,dict)]
                    stops=[available[i] for i in ids if i in available]
                    if len(stops)!=len(ids) or len(stops)<2:continue
                    # The selected departure, route and itinerary must describe the same leg.
                    start,end=departure.get('departure_time'),arrival.get('departure_time')
                    if not number(start) or not number(end) or end<start:continue
                    chosen=dict(base,mode='bus',start_time=start,end_time=end,duration=end-start,
                        route=str(route.get('route_short_name') or route.get('route_long_name') or 'Transit')[:100],network_id=str(route.get('route_network_id',''))[:180],
                        route_id=str(route.get('real_time_route_id') or '')[:100],headsign=str(itinerary.get('headsign',''))[:200],
                        realtime=bool(departure.get('is_real_time') and arrival.get('is_real_time')),
                        stops=stops,polyline=str((itinerary.get('plan_details') or {}).get('plan_shape',''))[:100000])
                    break
                if not chosen:valid=False;break
                base=chosen
            else:valid=False;break
            legs.append(base)
        if not valid or not legs or walk_total>max_walk*60 or not any(l['mode']=='bus' for l in legs):continue
        if any(legs[i]['end_time']>legs[i+1]['start_time'] for i in range(len(legs)-1)):continue
        results.append({'start_time':result['start_time'],'end_time':result['end_time'],'duration':result['duration'],
            'walk_minutes':math.ceil(walk_total/60),'accessibility':result.get('accessibility','None'),'legs':legs})
    return results[:3]


def parameters(q):
    out={}
    for name in ('from_lat','from_lon','to_lat','to_lon'):
        value=float(q.get(name,['nan'])[0])
        if not math.isfinite(value) or not (-90<=value<=90 if name.endswith('lat') else -180<=value<=180):
            raise ValueError('Choose valid starting and destination coordinates.')
        out[name]=round(value,6)
    max_walk=int(q.get('max_walk',['15'])[0])
    if max_walk not in (5,10,15,20,30):raise ValueError('Invalid walking preference.')
    mode=q.get('mode',['now'])[0]
    if mode not in ('now','leave','arrive'):raise ValueError('Invalid travel time.')
    at=None
    if mode!='now':
        at=float(q.get('at',['nan'])[0])
        if not math.isfinite(at) or not time.time()-60<=at<=time.time()+7*86400:raise ValueError('Choose a future trip within seven days.')
        at=int(at)
    return out,max_walk,q.get('step_free',['false'])[0]=='true',mode,at


def plan(q,cache):
    points,max_walk,step_free,mode,at=parameters(q)
    if not configured():return {'available':False,'reason':'Transit is not configured. Using 511.'}
    def run():
        params=dict(points,mode='transit',secondary_mode='walk',allowed_modes='Bus',
            num_result=6,max_num_legs=7,should_use_walk_path_duration='true',should_include_directions='true',should_update_realtime='true',consider_downtimes='true',
            accessibility_need='strict' if step_free else 'none',walk_speed=1.25,
            max_distance_between_location_and_stop=min(1500,max_walk*75))
        if at is not None:params['arrival_time' if mode=='arrive' else 'leave_time']=at
        raw=request('plan',params)
        results=normalize(raw,None,max_walk,step_free)
        empty_reason=None;walking_options=[]
        if not results:
            if max_walk<30 and normalize(raw,None,30,step_free):
                empty_reason='walking_limit';walking_options=normalize(raw,None,30,step_free)
            elif step_free and normalize(raw,None,max_walk,False):empty_reason='accessibility'
            elif any(any(leg.get('leg_mode')=='transit' for leg in result.get('legs',[]) if isinstance(leg,dict)) for result in raw.get('results',[]) if isinstance(result,dict)):empty_reason='unusable_plan'
            else:empty_reason='no_departures'
        return {'available':True,'source':'Transit','fetched':int(time.time()),'results':results,'empty_reason':empty_reason,'walking_options':walking_options}
    key='transit:walk-path-plan:'+json.dumps([points,max_walk,step_free,mode,at if at is not None else int(time.time()//120)],sort_keys=True)
    try:return cache(key,90,run)
    except RuntimeError as e:return {'available':False,'reason':str(e)}
