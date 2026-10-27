import assert from 'node:assert/strict';
import {equalShares,equalSelectedShares,equalUnitShares,sum} from '../lib/finance.ts';

// Eight studios plus the common areas, mirroring the project configuration.
const units=['Áreas comuns',...Array.from({length:8},(_,i)=>`Loft ${String(i+1).padStart(2,'0')}`)];
const common=units[0];
const studios=units.slice(1);
const categories=['Terreno','Obra','Mobiliário','Taxas'];
const pct=shares=>Math.round(sum(Object.values(shares))*100);
const zeros=keys=>Object.fromEntries(keys.map(k=>[k,0]));

// "Distribuir igualmente" rebalances only the units the user already selected:
// the eight studios stay at 12,5% each and the common areas remain at zero.
const selectedOnly={...zeros(units)};
for(const u of studios)selectedOnly[u]=10;
const rebalanced=equalUnitShares(units,selectedOnly);
assert.equal(rebalanced[common],0);
for(const u of studios)assert.equal(rebalanced[u],12.5);
assert.equal(pct(rebalanced),10000);

// A single selected unit takes the whole 100%, proving the selection drives the
// split instead of the full unit list.
const single=equalUnitShares(units,{...zeros(units),'Loft 03':5});
assert.equal(single['Loft 03'],100);
assert.equal(single[common],0);
assert.equal(single['Loft 01'],0);

// A single unit holding the whole 100% is the untouched default of a new
// lançamento: spreading it across the studios is the expected result, so the
// common areas do not swallow the entire rateio.
const untouched=equalUnitShares(units,{[common]:100,...zeros(studios)});
assert.equal(untouched[common],0);
for(const u of studios)assert.equal(untouched[u],12.5);
assert.equal(pct(untouched),10000);
const spreadFromStudio=equalUnitShares(units,{'Loft 05':100,...zeros(units.filter(u=>u!=='Loft 05'))});
assert.equal(spreadFromStudio['Loft 05'],12.5);
assert.equal(spreadFromStudio[common],0);

// With nothing selected the suggested pool is used, so the common areas are not
// added back silently — the eight studios share the total.
const fresh=equalUnitShares(units,zeros(units));
assert.equal(fresh[common],0);
for(const u of studios)assert.equal(fresh[u],12.5);
assert.equal(pct(fresh),10000);

// Units that must be preserved (inactive units already linked to the entry)
// keep their percentage; only the remainder is divided.
const preserved='Loft 08';
const withPreserved=equalUnitShares(units,{...zeros(units),[preserved]:10},[preserved]);
assert.equal(withPreserved[preserved],10);
assert.equal(pct(withPreserved),10000);
const rest=studios.filter(u=>u!==preserved).map(u=>withPreserved[u]);
assert.ok(rest.every(v=>v===12.85||v===12.86));
assert.equal(withPreserved[common],0);

// Selections that cannot be split are reported instead of producing a silent
// invalid rateio.
assert.throws(()=>equalUnitShares([],{}),/Informe os itens do rateio/);
assert.throws(()=>equalUnitShares(units,{...zeros(units),[preserved]:100},[preserved]),/Nada a distribuir/);

// The generic helper follows the same rule for categories and for the budget
// units editor, and keeps the legacy behaviour when nothing is selected.
const partial=equalSelectedShares(categories,{[categories[1]]:20,[categories[2]]:20});
assert.equal(partial[categories[1]],50);
assert.equal(partial[categories[2]],50);
assert.equal(pct(partial),10000);
assert.deepEqual(equalSelectedShares(categories,{}),equalShares(categories));
assert.deepEqual(equalSelectedShares(units,zeros(units),studios),equalShares(studios));
assert.throws(()=>equalSelectedShares([], {}),/Informe os itens do rateio/);

// Large and uneven pools still close at exactly 100,00%.
for(const size of [1,2,3,6,7,8,9]){
 const pool=units.slice(0,size);
 const out=equalSelectedShares(pool,Object.fromEntries(pool.map(u=>[u,1])));
 assert.equal(pct(out),10000);
 assert.equal(Object.keys(out).length,size);
 assert.ok(Object.values(out).every(v=>Math.abs(v*100-Math.round(v*100))<1e-7));
}

// Zeros never leak into the result: unselected units stay exactly at zero.
const mixed=equalUnitShares(units,{...zeros(units),'Loft 01':0,'Loft 02':0,'Loft 03':7,'Loft 04':0});
assert.equal(mixed['Loft 03'],100);
assert.equal(mixed['Loft 01'],0);
assert.equal(mixed['Loft 04'],0);

// Helpers never mutate the rateio they receive.
const snapshot={...zeros(units),'Loft 01':12.5};
const frozen=JSON.stringify(snapshot);
equalUnitShares(units,snapshot);
equalSelectedShares(units,snapshot);
assert.equal(JSON.stringify(snapshot),frozen);

console.log('PASS: distribuição igualitária apenas entre as unidades selecionadas, com preservação de unidades inativas.');
