import test from 'node:test';
import assert from 'node:assert/strict';
import { KENAMS_ID, stableMessageId, testConversation, latestUnanswered, emitAck } from './bot-interactions-core.mjs';
const now=Date.parse('2026-09-13T12:00:00Z');
const incoming={id:'source',senderUserId:KENAMS_ID,createdAt:new Date(now-60_000).toISOString()};
test('server senderUserId is recognized even with no senderId',()=>assert.equal(latestUnanswered([incoming],'bot',now),incoming));
test('old messages are not replayed on first deployment',()=>assert.equal(latestUnanswered([{...incoming,createdAt:new Date(now-2*86400_000).toISOString()}],'bot',now),null));
test('latest incoming message is selected regardless of history ordering',()=>{
 const newer={...incoming,id:'new',createdAt:new Date(now-1000).toISOString()};
 assert.equal(latestUnanswered([newer,incoming],'bot',now),newer);
});
test('previous successful reply prevents repeated reply',()=>assert.equal(latestUnanswered([incoming,{senderUserId:'bot',createdAt:new Date(now).toISOString()}],'bot',now),null));
test('deterministic reply prevents retry duplication even with clock skew',()=>assert.equal(latestUnanswered([incoming,{senderUserId:'bot',createdAt:new Date(now-120_000).toISOString(),clientMessageId:stableMessageId('bot','source','reply')}],'bot',now),null));
test('message ids are valid, stable and isolated per bot',()=>{
 const a=stableMessageId('bot','source','reply');assert.match(a,/^[a-f0-9]{8}-[a-f0-9]{4}-5[a-f0-9]{3}-a[a-f0-9]{3}-[a-f0-9]{12}$/);
 assert.equal(a,stableMessageId('bot','source','reply'));assert.notEqual(a,stableMessageId('other','source','reply'));
});
test('test conversations exclude outsiders and groups without Kenams',()=>{
 const c=ids=>({members:ids.map(userId=>({userId}))}); const ids=new Set(['bot']);
 assert.equal(testConversation(c([KENAMS_ID,'bot']),ids),true);
 assert.equal(testConversation(c([KENAMS_ID,'bot','outsider']),ids),false);
 assert.equal(testConversation(c(['bot']),ids),false);
});
test('acknowledgements reject timeout and server refusal',async()=>{
 const socket=(error,result)=>({timeout:()=>({emit:(_event,_payload,callback)=>callback(error,result)})});
 await assert.rejects(emitAck(socket(new Error('timeout')),'message:send',{}),/timeout/);
 await assert.rejects(emitAck(socket(null,{ok:false,error:'FORBIDDEN'}),'message:send',{}),/FORBIDDEN/);
 await assert.rejects(emitAck(socket(null,undefined),'message:send',{}),/invalid acknowledgement/);
 assert.equal((await emitAck(socket(null,{ok:true}),'message:send',{})).ok,true);
});
