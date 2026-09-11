import {
  OPS_EDITABLE_PARAMETERS,
  type OpsEditableParameterKey,
  type OpsNetworkPreview,
  type OpsParameterUpdateResult,
} from '@ssafy-net/shared';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { api } from '../../api/client';
import { Muted, Notice } from '../../components/primitives';
import { DataTable, fmtNum, fmtPct } from './charts';

/**
 * 후보 기준값 레버 (D-91).
 *
 * 여기서 바꾸는 둘이 **추천이 생기느냐 마느냐**를 정한다 — 전원 교집합 기준(P-04)과
 * 관심사 최소 선택 수(P-01). 그동안은 VM 에서 `psql` 로 `app_parameter` 를 고쳐야 했다.
 *
 * 미리보기를 버튼으로 두는 이유는 계산이 재계산과 같은 파이프라인이라 가볍지 않기
 * 때문이다. 기준을 낮출수록 후보가 폭발적으로 늘어 시간이 함께 는다 — 그래서 걸린
 * 시간도 같이 보여준다. 그 숫자가 곧 배치(`network.recompute`)가 쓸 시간이다.
 */
export function NetworkThresholds({
  minCommon,
  minInterests,
  onChanged,
}: {
  minCommon: number;
  minInterests: number;
  onChanged: () => Promise<void>;
}) {
  const [draft, setDraft] = useState<Record<OpsEditableParameterKey, string>>({
    'P-04': String(minCommon),
    'P-01': String(minInterests),
  });
  const [preview, setPreview] = useState<OpsNetworkPreview | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState<OpsEditableParameterKey | null>(null);

  const current: Record<OpsEditableParameterKey, number> = {
    'P-04': minCommon,
    'P-01': minInterests,
  };

  const loadPreview = async () => {
    setLoading(true);
    try {
      setPreview(await api.get<OpsNetworkPreview>('/admin/ops/network/preview'));
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setLoading(false);
    }
  };

  const save = async (key: OpsEditableParameterKey) => {
    const value = Number(draft[key]);
    const def = OPS_EDITABLE_PARAMETERS[key];
    if (!Number.isInteger(value) || value < def.min || value > def.max) {
      toast.error(`${def.min}~${def.max} 사이의 정수여야 합니다.`);
      return;
    }
    setSaving(key);
    try {
      const result = await api.put<OpsParameterUpdateResult>('/admin/ops/parameters', {
        key,
        value,
      });
      toast.success(
        `${key} ${result.oldValue} → ${result.newValue} · 다시 계산했습니다 — 후보 ${fmtNum(result.candidates)} · 노출 ${fmtNum(result.exposed)}`,
      );
      setPreview(null);
      await onChanged();
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setSaving(null);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        {(Object.keys(OPS_EDITABLE_PARAMETERS) as OpsEditableParameterKey[]).map((key) => {
          const def = OPS_EDITABLE_PARAMETERS[key];
          const value = Number(draft[key]);
          const dirty = Number.isInteger(value) && value !== current[key];
          const warn = Number.isInteger(value) && value < def.warnBelow;

          return (
            <div key={key} className="flex min-w-0 flex-col gap-2 rounded-lg border bg-card p-3.5">
              <div className="flex items-baseline justify-between gap-2">
                <SectionHeading>{LABELS[key]}</SectionHeading>
                <Muted className="shrink-0 text-[12px]">
                  {key} · 지금 {current[key]}
                </Muted>
              </div>

              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  inputMode="numeric"
                  min={def.min}
                  max={def.max}
                  className="w-24"
                  value={draft[key]}
                  onChange={(event) =>
                    setDraft((prev) => ({ ...prev, [key]: event.target.value }))
                  }
                />
                <Button
                  type="button"
                  size="sm"
                  disabled={!dirty || saving !== null}
                  onClick={() => void save(key)}
                >
                  {saving === key ? '저장 중…' : '저장하고 다시 계산'}
                </Button>
              </div>

              <Muted className="text-[12.5px]">{def.note}</Muted>
              {warn ? <Notice className="text-[12.5px]">{def.warning}</Notice> : null}
            </div>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" variant="outline" size="sm" disabled={loading} onClick={() => void loadPreview()}>
          {loading ? '계산 중…' : preview ? '미리보기 다시 계산' : '기준값별 미리보기'}
        </Button>
        <Muted className="text-[12.5px]">
          지금 데이터로 기준값마다 후보가 몇 개가 되는지 계산해 봅니다. 저장하는 것은 없습니다.
        </Muted>
      </div>

      {preview ? <PreviewTable preview={preview} /> : null}

      <Muted className="text-[12.5px]">
        이미 노출된 추천은 바뀌지 않습니다 — 멤버와 공통 관심사가 노출 시점에 고정됩니다(D-45). 새 값은 다음
        후보부터 적용됩니다.
      </Muted>
    </div>
  );
}

const LABELS: Record<OpsEditableParameterKey, string> = {
  'P-04': '전원 교집합 기준',
  'P-01': '관심사 최소 선택 수',
};

function SectionHeading({ children }: { children: React.ReactNode }) {
  return <span className="truncate text-[13.5px] font-semibold">{children}</span>;
}

/**
 * 기준값별 결과. **"인기뿐"이 후보 수보다 중요하다** — 기준을 낮출수록 후보는 늘지만
 * 그 후보는 인기 관심사만으로 묶인 것이 된다(docs/10 §3·§4). 절반을 넘으면 붉게 보인다.
 */
function PreviewTable({ preview }: { preview: OpsNetworkPreview }) {
  return (
    <div className="flex flex-col gap-2">
      <DataTable
        head={['기준', '후보', '추천 받는 사람', '1인당', '인기 관심사뿐']}
        align={['left', 'right', 'right', 'right', 'right']}
        rows={preview.rows.map((row) => [
          <span className={row.current ? 'font-semibold' : undefined}>
            {row.minCommon}
            {row.current ? ' · 지금' : ''}
          </span>,
          fmtNum(row.candidates),
          preview.activeUsers
            ? `${fmtNum(row.coveredUsers)}명 (${fmtPct(row.coveredUsers / preview.activeUsers)})`
            : '–',
          row.perUser.toFixed(2),
          row.popularOnly === null ? (
            '–'
          ) : (
            <span className={row.popularOnly >= 0.5 ? 'font-semibold text-destructive' : undefined}>
              {fmtPct(row.popularOnly)}
            </span>
          ),
        ])}
      />
      <Muted className="text-[12.5px]">
        활성 {fmtNum(preview.activeUsers)}명 · 계산 {fmtNum(preview.computeMs)}ms ·
        보유율 {fmtPct(preview.popularThreshold)} 이상을 인기로 셈
        {preview.popularInterests.length
          ? ` (${preview.popularInterests.slice(0, 8).join(', ')}${preview.popularInterests.length > 8 ? ' 외' : ''})`
          : ' — 해당 없음'}
        . "1인당"은 게이트 기준 1.00 과 같은 계산입니다(docs/10 §4).
      </Muted>
    </div>
  );
}
