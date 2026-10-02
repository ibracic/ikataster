import { expect, it, vi } from 'vitest';
import type { Map } from 'maplibre-gl';
import { APP_LAYERS, installLayer, layerOwnership, isOwnLayer, type LayerDefinition } from './appLayers';
import { basemapLabelLayers } from './layers';
it('ownership follows definitions, not name prefixes, including arbitrary overlay labels', () => {
  const definition: LayerDefinition = { source: 'custom', options: {type:'geojson'}, layers:[{id:'arbitrary-label',type:'symbol',source:'custom'}] };
  const owns = layerOwnership([definition]);
  expect(owns('arbitrary-label')).toBe(true);
  expect(owns('results-basemap-road')).toBe(false);
  expect(basemapLabelLayers([...definition.layers,{id:'road-label',type:'symbol'}],owns)).toEqual(['road-label']);
  for (const d of APP_LAYERS) for (const l of d.layers) expect(isOwnLayer(l.id)).toBe(true);
});
it('installs layers once, updates data and restores missing layers after a style change', () => {
  const layers = new Set<string>(); let source: {setData: ReturnType<typeof vi.fn>} | undefined;
  const m = {getSource:()=>source,addSource:vi.fn(()=>{source={setData:vi.fn()};}),getLayer:(id:string)=>layers.has(id),addLayer:vi.fn((l:{id:string})=>layers.add(l.id))};
  const data = {type:'FeatureCollection' as const,features:[]};
  installLayer(m as unknown as Map, APP_LAYERS[0],data);
  installLayer(m as unknown as Map, APP_LAYERS[0],data);
  expect(m.addSource).toHaveBeenCalledTimes(1);
  expect(m.addLayer).toHaveBeenCalledTimes(APP_LAYERS[0].layers.length);
  expect(source!.setData).toHaveBeenCalledWith(data);
  layers.clear();source=undefined;
  installLayer(m as unknown as Map, APP_LAYERS[0],data);
  expect(m.addSource).toHaveBeenCalledTimes(2);
});
