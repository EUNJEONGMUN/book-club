const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');

function setup(){
  let connections=0,fetches=0;
  class Socket{}
  Socket.prototype.connect=function(){connections++;return this;};
  const sandbox={require:name=>{assert.equal(name,'node:net');return {Socket};},URL,fetch:()=>{fetches++;return Promise.resolve('local');}};
  vm.runInNewContext(fs.readFileSync(path.resolve('scripts/local-network-guard.cjs'),'utf8'),sandbox);
  return {Socket,sandbox,counts:()=>({connections,fetches})};
}

test('hosted API is rejected before a network connection for normal and normalized socket arguments',()=>{
  for(const args of [[{port:443,host:'chvprcpdfgivnfkgwkem.supabase.co'}],[[{port:443,host:'chvprcpdfgivnfkgwkem.supabase.co'},()=>{}]],['443','example.com']]){
    const x=setup();assert.throws(()=>new x.Socket().connect(...args),/non-local/);assert.equal(x.counts().connections,0);
  }
});

test('only loopback and local Unix sockets are allowed',()=>{
  for(const args of [[{port:12345,host:'127.0.0.1'}],[12345,'localhost'],[{path:'/tmp/local-verification.sock'}]]){
    const x=setup();new x.Socket().connect(...args);assert.equal(x.counts().connections,1);
  }
  const x=setup();assert.throws(()=>new x.Socket().connect({host:'127.0.0.1.example.com',port:443}),/non-local/);
});

test('fetch blocks external URLs without calling the underlying implementation',async()=>{
  const x=setup();assert.throws(()=>x.sandbox.fetch('https://chvprcpdfgivnfkgwkem.supabase.co/rest/v1/meetings'),/non-local/);
  assert.throws(()=>x.sandbox.fetch('https://127.0.0.1@example.com/'),/non-local/);assert.equal(x.counts().fetches,0);
  await x.sandbox.fetch('http://127.0.0.1:12345/auth/v1/health');assert.equal(x.counts().fetches,1);
});
