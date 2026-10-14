import test from 'node:test';
import assert from 'node:assert/strict';
import {SharedGraph} from '../shared/graph.js';
test('shared line interpolation supports smooth, linear and step without joining gaps',()=>{
 const p=[[0,10],[20,30],[40,null],[60,20],[80,0]];
 assert.equal(SharedGraph.path(p,'linear',100),'M 0 10 L 20 30 H 40 M 60 20 L 80 0 H 100');
 assert.equal(SharedGraph.path(p,'step',100),'M 0 10 H 20 V 30 H 40 M 60 20 H 80 V 0 H 100');
 assert.equal(SharedGraph.path(p,'smooth',100),'M 0 10 C 10 10, 10 30, 20 30 H 40 M 60 20 C 70 20, 70 0, 80 0 H 100');
 assert.equal(SharedGraph.path([],'smooth'),'');
 assert.equal(SharedGraph.path([[0,null]],'linear',10),'');
 assert.equal(SharedGraph.path([[0,0]],'step',10),'M 0 0 H 10');
 assert.throws(()=>SharedGraph.path([[0,0]],'invalid'),/line_interpolation/);
});
