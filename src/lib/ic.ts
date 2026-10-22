import { Actor, HttpAgent, type ActorSubclass } from '@icp-sdk/core/agent';
import { idlFactory as snsGovIdl } from '../declarations/sns_governance.idl.js';
import { idlFactory as snsRootIdl } from '../declarations/sns_root.idl.js';
import { idlFactory as nnsGovIdl } from '../declarations/nns_governance.idl.js';
import { idlFactory as wnIdl } from '../declarations/water_neuron.idl.js';
import type { _SERVICE as SnsGov } from '../declarations/sns_governance';
import type { _SERVICE as SnsRoot } from '../declarations/sns_root';
import type { _SERVICE as NnsGov } from '../declarations/nns_governance';
import type { _SERVICE as WaterNeuron } from '../declarations/water_neuron';

export const IDS = {
  waterNeuron: 'tsbvt-pyaaa-aaaar-qafva-cai',
  wtnGovernance: 'jfnic-kaaaa-aaaaq-aadla-cai',
  wtnRoot: 'jmod6-4iaaa-aaaaq-aadkq-cai',
  nnsGovernance: 'rrkah-fqaaa-aaaaa-aaaaq-cai',
} as const;

export const REPO = 'WaterNeuron/WaterNeuron';

let agentP: Promise<HttpAgent> | null = null;
const agent = () => (agentP ??= HttpAgent.create({ host: 'https://icp-api.io' }));

const make = async <T>(idl: any, canisterId: string): Promise<ActorSubclass<T>> =>
  Actor.createActor<T>(idl, { agent: await agent(), canisterId });

export const snsGov = () => make<SnsGov>(snsGovIdl, IDS.wtnGovernance);
export const snsRoot = () => make<SnsRoot>(snsRootIdl, IDS.wtnRoot);
export const nnsGov = () => make<NnsGov>(nnsGovIdl, IDS.nnsGovernance);
export const waterNeuron = () => make<WaterNeuron>(wnIdl, IDS.waterNeuron);

/** repo where .github/workflows/build-wtn.yml publishes builds/<commit>.json */
export const BUILDS_REPO = 'marcinkolacz-cloud/wtn-verifier';

/** Cloudflare Worker (worker/) that explains proposals with Workers AI; set VITE_EXPLAIN_URL in .env.local */
export const EXPLAIN_URL: string | undefined = import.meta.env.VITE_EXPLAIN_URL;
