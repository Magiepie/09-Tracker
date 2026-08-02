import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const dataDir=path.join(root,'data');
const playersDir=path.join(dataDir,'players');
const API='http://api.2009scape.org:3000/hiscores/playerSkills/2/';
const PLAYER_LIST_API='http://api.2009scape.org:3000/hiscores/playersByTotal/2';
const ACTIVITY_API='http://api.2009scape.org:3000/hiscores/getWorldTotalAttribute/2/';
const ACTIVITIES=['logs_chopped','fish_caught','rocks_mined','enemies_killed','deaths','alkharid_gate'];
const PERIODS={day:1,week:7,month:30};
let excludedPlayers=new Set();
const readJson=async file=>JSON.parse(await fs.readFile(file,'utf8'));
const writeJson=async(file,data)=>fs.writeFile(file,JSON.stringify(data,null,2)+'\n');
const slug=value=>value.trim().toLowerCase().replace(/\s+/g,'-').replace(/[^a-z0-9_-]/g,'');
const totalXp=s=>s.skills.reduce((n,v)=>n+v.xp,0);
const baseline=(shots,at,days)=>{const cutoff=new Date(at).getTime()-days*86400000;return shots.filter(s=>new Date(s.capturedAt).getTime()<=cutoff).at(-1)||shots[0]};
const gain=(shots,latest,days,skill=0)=>{const base=baseline(shots,latest.capturedAt,days);if(skill===0)return Math.max(0,totalXp(latest)-totalXp(base));return Math.max(0,latest.skills[skill-1].xp-base.skills[skill-1].xp)};

function issuePlayer(body=''){
  const match=body.match(/###\s*Player name\s*\r?\n+\s*([^\r\n]+)/i);
  return match?.[1]?.trim();
}

async function fetchPlayer(player){
  const response=await fetch(API+encodeURIComponent(player),{headers:{Accept:'application/json'},signal:AbortSignal.timeout(20000)});
  if(!response.ok)throw new Error(`Hiscores returned ${response.status} for ${player}`);
  const payload=await response.json();
  if(!Array.isArray(payload.skills)||payload.skills.length!==24)throw new Error(`Unexpected skill data for ${player}`);
  return {info:payload.info||{},skills:payload.skills.map(s=>({id:Number(s.id),level:Number(s.static),xp:Math.floor(Number(s.experience))})).sort((a,b)=>a.id-b.id)};
}

async function fetchPlayerList(){
  const response=await fetch(PLAYER_LIST_API,{headers:{Accept:'application/json'},signal:AbortSignal.timeout(60000)});
  if(!response.ok)throw new Error(`Player list returned ${response.status}`);
  const payload=await response.json();
  if(!Array.isArray(payload))throw new Error('Unexpected player-list data');
  return payload.map(row=>String(row.username||'').trim()).filter(Boolean);
}

async function updateActivities(){
  const file=path.join(dataDir,'activities.json');
  let doc={generatedAt:null,snapshots:[]};
  try{doc=await readJson(file)}catch(error){if(error.code!=='ENOENT')throw error}
  const fetchActivity=async key=>{
    const url=`${ACTIVITY_API}${key}/`;
    for(let attempt=1;attempt<=3;attempt++){
      try{
        const response=await fetch(url,{headers:{Accept:'application/json'},signal:AbortSignal.timeout(30000)});
        if(!response.ok){const detail=(await response.text().catch(()=>'' )).slice(0,200);throw new Error(`HTTP ${response.status}${detail?`: ${detail}`:''}`)}
        const payload=await response.json();
        const value=Math.floor(Number(payload.sum));
        if(!Number.isFinite(value)||value<0)throw new Error(`invalid sum: ${payload.sum}`);
        return [key,value];
      }catch(error){
        if(attempt===3)throw new Error(`${key}: ${error.message}`);
        const delay=2000*2**(attempt-1);
        console.warn(`Activity ${key} attempt ${attempt}/3 failed: ${error.message}; retrying in ${delay}ms`);
        await new Promise(resolve=>setTimeout(resolve,delay));
      }
    }
  };
  const results=await Promise.allSettled(ACTIVITIES.map(fetchActivity));
  const entries=results.filter(result=>result.status==='fulfilled').map(result=>result.value);
  results.filter(result=>result.status==='rejected').forEach(result=>console.error(`Activity fetch failed; preserving last value: ${result.reason.message}`));
  if(entries.length===0){console.error('World activities: every endpoint failed; checkpoint skipped');return false}
  const capturedAt=new Date().toISOString();
  const previous=doc.snapshots.at(-1)?.values||{};
  const shot={capturedAt,values:{...previous,...Object.fromEntries(entries)}};
  const today=capturedAt.slice(0,10);
  if(doc.snapshots.at(-1)?.capturedAt?.slice(0,10)===today)doc.snapshots[doc.snapshots.length-1]=shot;
  else doc.snapshots.push(shot);
  doc.generatedAt=capturedAt;
  await writeJson(file,doc);
  console.log(`World activities: saved daily checkpoint (${entries.length}/${ACTIVITIES.length} endpoints refreshed)`);
  return true;
}

function calculateRecords(shots){
  const records={day:0,week:0,month:0};
  for(const shot of shots)for(const [name,days] of Object.entries(PERIODS))records[name]=Math.max(records[name],gain(shots,shot,days));
  return records;
}

async function updatePlayer(player,{register=false,force=false,cooldownMinutes=0}={}){
  if(!/^[a-zA-Z0-9 _-]{1,12}$/.test(player))throw new Error('Player name must be 1–12 letters, numbers, spaces, underscores, or hyphens.');
  if(excludedPlayers.has(player.toLowerCase()))throw new Error(`${player}: excluded from tracking`);
  await fs.mkdir(playersDir,{recursive:true});
  const file=path.join(playersDir,`${slug(player)}.json`); let existing=null;
  try{existing=await readJson(file)}catch(error){if(error.code!=='ENOENT')throw error}
  if(existing&&cooldownMinutes&&Date.now()-new Date(existing.lastCheckedAt||0).getTime()<cooldownMinutes*60000){console.log(`${player}: skipped by ${cooldownMinutes}-minute cooldown`);return false}
  const current=await fetchPlayer(player); const now=new Date().toISOString();
  const shot={capturedAt:now,skills:current.skills};
  const changed=force||!existing||existing.snapshots.at(-1).skills.some((s,i)=>s.xp!==shot.skills[i].xp);
  if(changed){
    const doc=existing||{player,records:{day:0,week:0,month:0},snapshots:[]};
    doc.player=existing?.player||player; doc.info=current.info; doc.lastCheckedAt=now; doc.snapshots.push(shot); doc.records=calculateRecords(doc.snapshots);
    await writeJson(file,doc); console.log(`${player}: saved snapshot`);
  }else{existing.lastCheckedAt=now;await writeJson(file,existing);console.log(`${player}: no XP change`)}
  if(register||!existing){const index=await readJson(path.join(dataDir,'tracked-players.json'));if(!index.players.some(p=>p.toLowerCase()===player.toLowerCase())){index.players.push(player);index.players.sort((a,b)=>a.localeCompare(b));await writeJson(path.join(dataDir,'tracked-players.json'),index)}}
  return changed;
}

async function rebuildLeaderboard(){
  const index=await readJson(path.join(dataDir,'tracked-players.json'));const docs=[];
  for(const player of index.players){try{docs.push(await readJson(path.join(playersDir,`${slug(player)}.json`)))}catch{console.warn(`${player}: missing data file`)}}
  const output={generatedAt:new Date().toISOString(),day:{},week:{},month:{}};
  for(const [period,days] of Object.entries(PERIODS))for(let skill=0;skill<=24;skill++)output[period][skill]=docs.map(doc=>{const latest=doc.snapshots.at(-1);return{player:doc.player,gain:gain(doc.snapshots,latest,days,skill),currentXp:skill===0?totalXp(latest):latest.skills[skill-1].xp}}).filter(row=>row.gain>0).sort((a,b)=>b.gain-a.gain||a.player.localeCompare(b.player)).slice(0,42);
  await writeJson(path.join(dataDir,'top-gains.json'),output);
}

async function main(){
  excludedPlayers=new Set((await readJson(path.join(dataDir,'excluded-players.json'))).map(name=>name.toLowerCase()));
  const indexFile=path.join(dataDir,'tracked-players.json');
  const index=await readJson(indexFile);
  const allowed=index.players.filter(player=>!excludedPlayers.has(player.toLowerCase()));
  if(allowed.length!==index.players.length)await writeJson(indexFile,{...index,players:allowed});
  const args=process.argv.slice(2); const all=args.includes('--all'); const importOnly=args.includes('--import-only'); const fromIssue=args.includes('--issue'); const named=args.indexOf('--player');
  if(all||importOnly){
    const discovered=await fetchPlayerList();
    const known=new Set(allowed.map(player=>player.toLowerCase()));
    const batchSize=Math.max(0,Number(process.env.DISCOVERY_BATCH_SIZE||100));
    const additions=discovered.filter(player=>/^[a-zA-Z0-9 _-]{1,12}$/.test(player)&&!excludedPlayers.has(player.toLowerCase())&&!known.has(player.toLowerCase())).slice(0,batchSize);
    const playersToUpdate=importOnly?additions:[...allowed,...additions];
    console.log(`Player list: ${discovered.length} found, ${additions.length} new players selected (${importOnly?'import only':'daily update'})`);
    if(all)await updateActivities();
    for(const player of playersToUpdate){try{await updatePlayer(player,{register:true})}catch(error){console.error(error.message)}}
  }
  else{const player=fromIssue?issuePlayer(process.env.ISSUE_BODY):args[named+1];if(!player)throw new Error('No valid player name supplied.');await updatePlayer(player,{register:true,cooldownMinutes:fromIssue?15:0})}
  await rebuildLeaderboard();
}
main().catch(error=>{console.error(error);process.exitCode=1});
