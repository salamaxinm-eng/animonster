export async function GET(request:Request){
 const id=new URL(request.url).searchParams.get('id');if(!id||!/^\d{1,9}$/.test(id))return Response.json({error:'Некорректный тайтл'},{status:400});
 try{const r=await fetch(`https://shikimori.one/api/animes/${id}/videos`,{headers:{'User-Agent':'AniMonster/1.0'},signal:AbortSignal.timeout(10000)});if(!r.ok)throw Error();const data=await r.json() as Array<{player_url:string;url:string}>;return Response.json(data.filter((v:{player_url:string;url:string})=>/^https?:\/\/(www\.)?(youtube\.com|youtube-nocookie\.com)\/embed\/[a-zA-Z0-9_-]+/.test(v.player_url)&&/^https?:\/\//.test(v.url)).slice(0,8),{headers:{'Cache-Control':'public, max-age=600'}});}catch{return Response.json({error:'Видео временно недоступны'},{status:502});}
}

