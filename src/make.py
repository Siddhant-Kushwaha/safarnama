import json,sys,os
root='/home/claude/journey'
tpl=open(root+'/build/index.template.html',encoding='utf-8').read()
route=json.load(open(sys.argv[1] if len(sys.argv)>1 else root+'/data/route.json',encoding='utf-8'))
for p in route['places']: p.pop('vignette',None); p.pop('lat',None); p.pop('lon',None)
js=json.dumps(route,ensure_ascii=False,separators=(',',':')).replace('</','<\\/')
app=open(root+'/build/app.js',encoding='utf-8').read()
assert '</script' not in app
out=tpl.replace('/*ROUTE*/null',js).replace('/*APP*/',app)
open(root+'/site/index.html','w',encoding='utf-8').write(out)
print('index.html',len(out.encode()),'bytes')
