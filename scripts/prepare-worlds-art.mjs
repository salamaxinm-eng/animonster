// Explicitly authorized deterministic JPEG background removal. Original files are untouched.
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { createHash } from 'node:crypto';
const source = process.argv[2];
if (!source) throw new Error('Pass the attachment directory');
const directory = 'public/rewards/pass-worlds-2026';
await fs.mkdir(directory, { recursive: true });
const rows = [
 [1,'pin','Мугивары',1], [2,'frame','Путь пирата',3], [3,'tag','НАКАМА',2],
 [5,'background','Закат над Гранд Лайн',4], [6,'pin','Расенган',5], [7,'frame','Печать шиноби',6], [9,'tag','ШИНОБИ',7], [10,'background','Вечер в Конохе',8], [11,'pin','Занпакто',9], [13,'frame','Духовное пламя',11], [14,'tag','БАНКАЙ',10], [15,'background','Ночь в Обществе душ',null], [17,'pin','Антимагия',null], [18,'frame','Пятилистный клевер',null], [19,'tag','АНТИМАГИЯ',12], [21,'background','Цитадель антимагии',null], [22,'pin','Барабаны освобождения',13], [23,'frame','Гир пятый',14], [25,'tag','КОРОЛЬ ПИРАТОВ',15], [26,'background','Небесный остров',16], [27,'pin','Девятихвостый',17], [29,'frame','Чакра Курамы',18], [30,'tag','ДЖИНЧУРИКИ',19], [31,'background','Долина завершения',20], [33,'pin','Маска Пустого',21], [34,'frame','Предел банкая',22], [35,'tag','КОРОЛЬ МАГОВ',23], [37,'background','Королевство клевера',24], [38,'pin','Чёрные быки',25], [39,'frame','Капитан Чёрных быков',26],
 [10,'pin','Гримуар',null,'free'], [20,'background','Лес гримуаров',null,'free'], [30,'frame','Магия клевера',null,'free'], [40,'tag','МАГ-НОВИЧОК',27,'free'],
];
const rewards=[];
for (const [level,kind,name,number,track='premium'] of rows) {
 const slug=`pass-worlds-${track}-${level}`, item={level,track,kind,name,source:number,slug,file:null};
 if (number) {
  const bytes=await fs.readFile(path.join(source,`${number}-Фото-${number}.jpg`));
  item.sourceSha256=createHash('sha256').update(bytes).digest('hex');
  if(kind==='background') { item.file=`${slug}.jpg`; await fs.writeFile(`${directory}/${item.file}`,bytes); }
  else {
   const {data,info:{width:w,height:h}}=await sharp(bytes).ensureAlpha().raw().toBuffer({resolveWithObject:true});
   const seen=new Uint8Array(w*h), queue=new Int32Array(w*h); let head=0,tail=0;
   const white=(p)=>{const i=p*4;return Math.min(data[i],data[i+1],data[i+2])>=230 && Math.max(data[i],data[i+1],data[i+2])-Math.min(data[i],data[i+1],data[i+2])<=22;};
   const seed=p=>{if(p>=0&&p<w*h&&!seen[p]&&white(p)){seen[p]=1;queue[tail++]=p;}};
   for(let x=0;x<w;x++){seed(x);seed((h-1)*w+x)}for(let y=0;y<h;y++){seed(y*w);seed(y*w+w-1)}
   if(kind==='frame')seed(Math.floor(h/2)*w+Math.floor(w/2));
   while(head<tail){const p=queue[head++],x=p%w;data[p*4+3]=0;if(x)seed(p-1);if(x<w-1)seed(p+1);seed(p-w);seed(p+w)}
   // Retain all enclosed white ink/highlights. Only connected background is removed.
   let result=sharp(data,{raw:{width:w,height:h,channels:4}});
   if(kind==='tag'||kind==='pin') result=result.trim({background:'#00000000',threshold:0}).extend({top:4,bottom:4,left:4,right:4,background:'#00000000'});
   item.file=`${slug}.png`;await result.png().toFile(`${directory}/${item.file}`);
  }
  const output=await fs.readFile(`${directory}/${item.file}`);item.sha256=createHash('sha256').update(output).digest('hex');
 }
 rewards.push(item);
}
for(let level=4;level<=40;level+=4)rewards.push({level,track:'premium',kind:'plus',name:'3 дня Плюса',plus_days:3});
rewards.sort((a,b)=>a.level-b.level||a.track.localeCompare(b.track));
await fs.writeFile(`${directory}/manifest.json`,JSON.stringify({id:'anime-worlds-2026',title:'AniMonster · Четыре мира',rewards},null,2)+'\n');
console.log(JSON.stringify({prepared:rewards.filter(r=>r.file).length,missing:rewards.filter(r=>r.kind!=='plus'&&!r.file).map(r=>({level:r.level,track:r.track,name:r.name})),plusDays:30},null,2));
