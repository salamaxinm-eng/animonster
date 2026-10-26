#!/usr/bin/env python3
"""Deployment HTTP canary against a private app port and its PostgreSQL container.
Creates two temporary test accounts, never sends payments, and cleans up in finally.
Run only on the deployment host after migration 0064. Requires docker + psql in PG container.
"""
import subprocess,json,time,uuid,secrets,hashlib,urllib.request,urllib.error
PORT=3104
PSQL=['docker','exec','-i','animonster-postgres-1','psql','-X','-U','animonster','-d','animonster','-qAt','-v','ON_ERROR_STOP=1']
def sql(text):return subprocess.check_output(PSQL,input=text.encode()).decode().strip()
def api(path,token=None,payload=None,form=None,origin='https://animonster.su'):
 headers={'Origin':origin}
 if token:headers['Cookie']='am_session='+token
 data=None
 if payload is not None:data=json.dumps(payload).encode();headers['Content-Type']='application/json'
 if form is not None:
  boundary='nickname'+uuid.uuid4().hex
  data=('--'+boundary+'\r\nContent-Disposition: form-data; name="appearance"\r\n\r\n'+json.dumps(form)+'\r\n--'+boundary+'--\r\n').encode()
  headers['Content-Type']='multipart/form-data; boundary='+boundary
 req=urllib.request.Request('http://127.0.0.1:'+str(PORT)+path,data=data,headers=headers)
 try:
  with urllib.request.urlopen(req,timeout=25) as r:return r.status,json.load(r)
 except urllib.error.HTTPError as e:return e.code,json.load(e)
created=[]
try:
 assert api('/api/health')[0]==200
 assert api('/api/nickname/purchase',payload={'action':'check'})[0]==401
 assert api('/api/nickname/purchase',payload={'action':'check'},origin='https://evil.invalid')[0]==403
 for gifted in [False,True]:
  user=str(uuid.uuid4());created.append(user);token=secrets.token_hex(32);digest=hashlib.sha256(token.encode()).hexdigest();now=int(time.time()*1000)
  sql("INSERT INTO users(id,identity,nick,created_at,nickname_gift_at) VALUES ('"+user+"','test:nickname:"+user+"','StudioTest"+user[:8]+"',"+str(now)+","+(str(now) if gifted else 'NULL')+"); INSERT INTO sessions(hash,user_id,created_at,expires) VALUES ('"+digest+"','"+user+"',"+str(now)+","+str(now+600000)+");")
  status,me=api('/api/community?action=me',token);assert status==200,(status,me)
  assert me['user']['nickname_unlocked']==gifted
  form={'avatar':'moon','theme':'eclipse','frame':'none','pin':None,'tag':None,'background':None,'nickname_style':{'color':'mint','effect':'shimmer','motion':False}}
  status,result=api('/api/profile-hub',token,form=form);assert status==(200 if gifted else 403),(status,result)
  if gifted:
   status,profile=api('/api/community?action=profile&view=hub&id='+user)
   assert status==200 and profile['user']['nickname_style']==form['nickname_style'],(status,profile)
   assert 'nickname_unlocked' not in profile['user']
   assert api('/api/nickname/purchase',token,payload={'action':'buy'})[0]==409
  form['nickname_style']={'color':'legend','effect':'shimmer','motion':True}
  assert api('/api/profile-hub',token,form=form)[0]==403
  form['nickname_style']={'color':'evil','effect':'shimmer','motion':True}
  assert api('/api/profile-hub',token,form=form)[0]==400
  assert api('/api/nickname/purchase',token,payload={'action':'check','user_id':'other','amount':1})[1]['status']=='not_found'
  print('account checks passed', 'gift without Plus' if gifted else 'locked without purchase')
 for user in ['3c199d52-d4c1-48f3-8051-83ccbe5f00a5','72a2651c-ee22-48e2-8a2e-eaf81d83e332']:
  status,profile=api('/api/community?action=profile&view=hub&id='+user)
  assert status==200 and profile['user']['legend_origin_at'] and profile['user']['nickname_style'] is None
  assert 'nickname_unlocked' not in profile['user']
  print('real honorary gold preserved',profile['user']['nick'])
 status,catalog=api('/api/player-demo');assert status==200
 episodes=catalog.get('episodes',catalog.get('catalog',{}).get('episodes',[]));assert len(episodes)==19,len(episodes)
 print('19 demo episodes retained')
finally:
 for user in created:sql("DELETE FROM users WHERE id='"+user+"' AND identity='test:nickname:"+user+"';")
 print('temporary accounts and sessions removed')
