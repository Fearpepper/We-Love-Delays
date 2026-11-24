"""Ephemeral opt-in line activity. No GPS, accounts, IPs or location histories stored."""
import re, threading, time
LOCK=threading.Lock()
SESSIONS={}
def update(token,route,active):
    if not isinstance(token,str) or not re.fullmatch(r'[A-Za-z0-9-]{20,64}',token):raise ValueError('Invalid session')
    if not isinstance(route,str) or not re.fullmatch(r'[A-Za-z0-9 -]{1,40}',route):raise ValueError('Invalid route')
    with LOCK:
        now=time.time()
        for k in list(SESSIONS):
            if now-SESSIONS[k][1]>100:del SESSIONS[k]
        if not active:SESSIONS.pop(token,None)
        elif token in SESSIONS or len(SESSIONS)<2000:SESSIONS[token]=(route,now)
        return {'route':route,'count':sum(r==route for r,t in SESSIONS.values()),'source':'Opt-in active app sessions','expires_after_seconds':100}
def count(route):
    with LOCK:
        now=time.time()
        return {'count':sum(r==route and now-t<=100 for r,t in SESSIONS.values()),'source':'Opt-in active app sessions'}
