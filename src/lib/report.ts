import type { ProposalData } from '../declarations/sns_governance';
import {
  actionKey, breakdown, canisterHealth, canisterName, dashboardUrl, deadline, earlyDecision, fetchBuild, functions,
  genericCall, loadLabels, neuronControllers, rules, status, summaryClaims, upgradeCall, wouldPass,
  type WRow,
} from './data';
import { compact, cycles, DAY, hex, humanize, icp, opt, pct, relative, sha256 } from './format';

export async function proposalReport(p: ProposalData) {
  const id = opt(p.id)!.id;
  const prop = opt(p.proposal);
  const t = opt(p.latest_tally);
  const [yes, no, total] = [Number(t?.yes ?? 0n), Number(t?.no ?? 0n), Number(t?.total ?? 0n)];
  const s = status(p);
  const r = rules(p);
  const g = genericCall(p);
  const fn = g && (await functions()).get(g.function_id);
  const lines = [`**WTN proposal #${id}: ${prop?.title ?? 'Untitled'}**`];
  lines.push(`Type: ${fn ? `${fn.name}${fn.method ? ` → \`${fn.method}\`` : ''}` : humanize(actionKey(p))}`);
  lines.push(
    `Status: ${s}${s === 'Open' ? ` · closes ${relative(deadline(p))}` : ''} · Yes ${pct(yes, total)} / No ${pct(no, total)} of total VP`,
  );

  if (s === 'Open') {
    const early = earlyDecision(yes, no, total, r);
    const now = wouldPass(yes, no, total, r);
    lines.push(
      early ? `Outcome: already ${early === 'adopt' ? 'adopted' : 'rejected'}` : `If voting closed now: ${now.ok ? 'ADOPTED' : 'REJECTED'} (${now.why})`,
    );
  }

  try {
    const bd = breakdown(p, await neuronControllers(), loadLabels());
    lines.push('', 'By voter group (yes / no / not voted):');
    bd.groups
      .filter((g) => g.yes + g.no + g.open > 0)
      .forEach((g) => lines.push(`• ${g.entity}: ${compact(g.yes)} / ${compact(g.no)} / ${compact(g.open)} (${pct(g.yes + g.no + g.open, bd.total)})`));
  } catch {}

  const u = upgradeCall(p);
  if (u) {
    const chunked = opt(u.chunked_canister_wasm);
    const wasm = chunked ? hex(chunked.wasm_module_hash) : u.new_canister_wasm.length ? await sha256(u.new_canister_wasm) : undefined;
    const claims = summaryClaims(prop?.summary ?? '');
    const name = canisterName(opt(u.canister_id)?.toText());
    const build = claims.commit ? await fetchBuild(claims.commit).catch(() => null) : null;
    const built = name && build?.wasms[name];
    lines.push('', `Wasm sha256: \`${wasm ?? 'n/a'}\``);
    lines.push(
      !claims.commit
        ? '⚠️ No source commit in summary'
        : !build
          ? `Source commit ${claims.commit.slice(0, 12)} — not yet reproduced`
          : built === wasm
            ? `✅ Reproduced from commit ${claims.commit.slice(0, 12)} (${build.run_url})`
            : `❌ Build of ${claims.commit.slice(0, 12)} gives ${built?.slice(0, 12) ?? 'no artifact'} — does NOT match`,
    );
  }
  lines.push('', dashboardUrl(id));
  return lines.join('\n');
}

export async function statusReport(d: {
  mainDelay: number;
  mainState: string;
  stake: bigint;
  health: Awaited<ReturnType<typeof canisterHealth>>;
  source?: string;
  rows: WRow[];
}) {
  const frozen = d.rows.filter((r) => r.frozen);
  const risky = d.rows.filter((r) => r.nns?.state === 1 && Number(r.nns.dissolve_delay_seconds) > d.mainDelay);
  const lines = [
    '**WaterNeuron protocol status**',
    `Main 6m neuron: ${d.mainState}, delay ${(d.mainDelay / DAY).toFixed(1)} d, ${icp(d.stake, 0)} ICP`,
  ];
  if (d.health) {
    const runway = d.health.burnPerDay > 0n ? Number(d.health.cycles / d.health.burnPerDay) : undefined;
    lines.push(`Canister: ${cycles(d.health.cycles)} cycles${runway ? ` (~${runway} d runway)` : ''}, module \`${d.health.moduleHash?.slice(0, 12) ?? '?'}\`${d.source ? ` = ${d.source}` : ' (source not verified)'}`);
  }
  lines.push(`Open withdrawals: ${d.rows.length}, frozen: ${frozen.length}`);
  frozen.forEach((r) =>
    lines.push(`• #${r.w.request.withdrawal_id}: ${icp(r.w.request.icp_due)} ICP, delay ${(Number(r.nns!.dissolve_delay_seconds) / DAY).toFixed(1)} d`),
  );
  if (risky.length)
    lines.push(`⚠️ Cancelling ${risky.map((r) => `#${r.w.request.withdrawal_id}`).join(', ')} would raise the main delay.`);
  return lines.join('\n');
}
