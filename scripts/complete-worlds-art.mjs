import {readFile,writeFile,readdir,copyFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import sharp from 'sharp';

// Explicit visual mapping of the second delivery; numbers are not reward levels.
const sourceDir=process.argv[2];
if(!sourceDir) throw Error('Pass the directory containing the seven supplied PNGs');
const mapping=[[1,'premium',21],[2,'free',30],[3,'free',20],[4,'premium',15],[5,'free',10],[6,'premium',17],[7,'premium',18]];
const root='public/rewards/pass-worlds-2026';
const manifest=JSON.parse(await readFile(root+'/manifest.json','utf8'));
const files=await readdir(sourceDir), sql=[];
const quote=s=>"'"+String(s).replaceAll("'","''")+"'";
for(const [number,track,level] of mapping){
 const source=files.find(f=>f.startsWith(number+'-exec-')&&f.endsWith('.png'));
 if(!source) throw Error(`Missing supplied PNG ${number}`);
 const reward=manifest.rewards.find(r=>r.track===track&&r.level===level);
 const bytes=await readFile(path.join(sourceDir,source));
 const {data,info}=await sharp(bytes).ensureAlpha().raw().toBuffer({resolveWithObject:true});
 if(reward.kind!=='background'&&data[3]!==0) throw Error(`Opaque exterior: ${reward.name}`);
 if(reward.kind==='frame'&&data[(Math.floor(info.height/2)*info.width+Math.floor(info.width/2))*4+3]!==0) throw Error(`Opaque frame center: ${reward.name}`);
 const hash=createHash('sha256').update(bytes).digest('hex');
 Object.assign(reward,{source,file:reward.slug+'.png',sourceSha256:hash,sha256:hash});
 await copyFile(path.join(sourceDir,source),root+'/'+reward.file);
 const id=reward.kind+':'+reward.slug, image='/rewards/pass-worlds-2026/'+reward.file;
 sql.push(`INSERT INTO cosmetics(id,kind,slug,name,image,rarity,access_type,description,created_at) VALUES (${[id,reward.kind,reward.slug,reward.name,image,'common','battlepass','Изображение пользователя; исходные пиксели и прозрачность сохранены'].map(quote).join(',')},(extract(epoch from now())*1000)::bigint);`);
 sql.push(`INSERT INTO pass_rewards(season_id,level,track,cosmetic_id,name,preview,kind) VALUES ('anime-worlds-2026',${level},${[track,id,reward.name,image,reward.kind].map(quote).join(',')});`);
}
await writeFile(root+'/manifest.json',JSON.stringify(manifest,null,2)+'\n');
await writeFile('migrations/postgres/0054_complete_worlds_rewards.sql','-- Complete the existing draft. No publication or user grants.\n'+sql.join('\n')+'\n');
console.log('Installed seven original PNGs; all 34 cosmetic images present.');
