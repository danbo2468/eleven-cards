import test from 'node:test';
import assert from 'node:assert/strict';
import {SharedGraph} from '../shared/graph.js';

test('hover shares timestamps only with connected cards in the same group, without echoes', () => {
 globalThis.window = new EventTarget();
 const a={isConnected:true,_config:{}}, b={isConnected:true,_config:{}}, c={isConnected:true,_config:{hover_sync_group:'other'}};
 const seen=[];
 SharedGraph.connectHover(a, t=>seen.push(['a',t]));
 SharedGraph.connectHover(b, t=>seen.push(['b',t]));
 SharedGraph.connectHover(c, t=>seen.push(['c',t]));
 SharedGraph.publishHover(a, 1234);
 assert.deepEqual(seen,[['b',1234]]);
 SharedGraph.disconnectHover(a);SharedGraph.disconnectHover(b);SharedGraph.disconnectHover(c);
});

test('only the active source clears its group; disconnect releases listeners and active state', () => {
 globalThis.window=new EventTarget();
 const a={isConnected:true,_config:{}},b={isConnected:true,_config:{}},seen=[];
 SharedGraph.connectHover(a,t=>seen.push(['a',t]));SharedGraph.connectHover(b,t=>seen.push(['b',t]));
 SharedGraph.publishHover(a,10);SharedGraph.publishHover(b,20);seen.length=0;
 SharedGraph.clearHover(a);assert.deepEqual(seen,[]);
 SharedGraph.restoreHover(a);assert.deepEqual(seen,[['a',20]]);
 seen.length=0;SharedGraph.disconnectHover(b);assert.deepEqual(seen,[['a',null]]);
 seen.length=0;SharedGraph.publishHover(a,30);assert.deepEqual(seen,[]);
 SharedGraph.disconnectHover(a);assert.equal(SharedGraph.hoverState().size,0);
});

test('disabled, detached and invalid hover sources cannot publish', () => {
 globalThis.window=new EventTarget();
 const a={isConnected:true,_config:{sync_hover:false}},b={isConnected:true,_config:{}},seen=[];
 SharedGraph.connectHover(b,t=>seen.push(t));SharedGraph.publishHover(a,10);
 a._config={};a.isConnected=false;SharedGraph.publishHover(a,20);
 a.isConnected=true;SharedGraph.publishHover(a,NaN);assert.deepEqual(seen,[]);
 SharedGraph.disconnectHover(b);
});
