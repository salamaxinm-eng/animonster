export async function GET(request:Request){
 const url=new URL(request.url);const q=url.searchParams.get('q')?.slice(0,100)||'';const kind=url.searchParams.get('kind')==='movie'?'movie':'';
 const params=new URLSearchParams({limit:'24',order:'popularity',censored:'true'});if(q)params.set('search',q);if(kind)params.set('kind',kind);
 try{const response=await fetch('https://shikimori.one/api/animes?'+params,{headers:{'User-Agent':'AniMonster/1.0'},signal:AbortSignal.timeout(10000)});if(!response.ok)throw Error();return Response.json(await response.json(),{headers:{'Cache-Control':'public, max-age=300'}});}catch{return Response.json({error:'Каталог временно недоступен'},{status:502});}
}
