import assert from 'node:assert/strict';
import test from 'node:test';
import { aggregateTftMatches } from '../src/engine/match-samples.js';
const units=['a','b','c','d','e','f','g','h','i','j'].map(x=>'DA_18_'+x);
const comps=[{id:'alpha',name:'阵容甲',units:units.slice(0,5)},{id:'beta',name:'阵容乙',units:units.slice(5)}];
const setData={set:18,units:units.map(id=>({id}))};
function fixture(id,change={}){
  return {metadata:{match_id:id},info:{tft_set_number:18,queue_id:1100,game_version:'Version 16.23.1.1',
    participants:Array.from({length:8},(_,i)=>({
      puuid:'fixture-'+i,placement:i+1,units:units.slice(i<4?0:5,i<4?5:10).map(id=>({character_id:id.replace('DA_18_','TFT18_')})),
    })),...change}};
}
test('groups actual terminal boards and deduplicates match IDs',()=>{
  const m=fixture('NA1_1');const r=aggregateTftMatches([m,m,fixture('NA1_2')],{comps,setData});
  assert.equal(r.matches,2); assert.equal(r.duplicates,1);
  assert.deepEqual(r.comps.map(x=>[x.id,x.samples,x.top4,x.first,x.average]),[['alpha',8,100,25,2.5],['beta',8,0,0,6.5]]);
  assert.doesNotMatch(JSON.stringify(r),/fixture-|NA1_1/);
});
test('ignores wrong patches, queues, seasons, and incomplete results',()=>{
  const r=aggregateTftMatches([fixture('A',{game_version:'Version 16.22.1'}),fixture('B',{queue_id:1090}),
    fixture('C',{tft_set_number:17}),fixture('D',{participants:[]})],{comps,setData});
  assert.equal(r.matches,0);assert.equal(r.versionSkipped,2);assert.equal(r.queueSkipped,1);assert.equal(r.invalid,1);
});
test('ambiguous matches do not inflate board statistics',()=>{
  const r=aggregateTftMatches([fixture('A')],{setData,comps:[comps[0],{...comps[0],id:'duplicate'}]});
  assert.equal(r.matchedBoards,0);
  assert.equal(r.comps.length,0);
});
