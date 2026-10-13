import sharp from 'sharp';
import {readFile} from 'node:fs/promises';
for(const name of ['one-piece','bleach','black-clover','naruto']){
 const input=await readFile(`public/rewards/pass/${name}.jpg`);
 const circle=Buffer.from(`<svg width="256" height="256"><circle cx="128" cy="128" r="116" fill="white"/></svg>`);
 const border=Buffer.from(`<svg width="256" height="256"><circle cx="128" cy="128" r="115" fill="none" stroke="#d0935c" stroke-width="7"/><circle cx="128" cy="128" r="121" fill="none" stroke="#27211e" stroke-width="3"/></svg>`);
 const pixels=await sharp(input).resize(256,256,{fit:'cover',position:'centre'}).ensureAlpha().composite([{input:circle,blend:'dest-in'}]).png().toBuffer();
 await sharp(pixels).composite([{input:border}]).png().toFile(`public/rewards/pass/${name}-pin.png`);
 console.log(name,(await sharp(input).metadata()).width,(await sharp(input).metadata()).height);
}
