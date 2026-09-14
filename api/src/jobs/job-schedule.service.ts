import { Injectable } from '@nestjs/common';
import {
  OPS_JOB_HOURS_MAX,
  OPS_SCHEDULED_JOBS,
  OPS_SCHEDULED_JOB_NAMES,
  type OpsJobSchedule,
  type OpsScheduledJobName,
} from '@ssafy-net/shared';
import { PrismaService } from '../infra/prisma/prisma.service';

const CACHE_MS = 30_000;
const KST_OFFSET_MS = 9 * 3_600_000;

interface Row {
  enabled: boolean;
  hours: number[];
  updatedAt: Date | null;
}

/**
 * 시각이 정해진 배치의 스위치와 시각 (D-96).
 *
 * 기본값은 코드에 있고(`OPS_SCHEDULED_JOBS`), DB 의 `job_schedule` 은 **운영자가 바꾼 것만**
 * 담는다. 행이 없으면 지금까지와 똑같이 돈다 — 빈 DB 를 새로 띄워도 09:00 묶음 알림과
 * 09·18시 재계산이 그대로다.
 *
 * 30초 캐시를 두는 이유는 ParametersService 와 같다. 매시 정각의 디스패처가 읽는데
 * 값은 거의 안 바뀐다. 운영자가 바꾸면 그 자리에서 캐시를 비우므로 다음 정각에 새 시각이 걸린다.
 */
@Injectable()
export class JobScheduleService {
  private cache = new Map<OpsScheduledJobName, Row>();
  private loadedAt = 0;

  constructor(private readonly prisma: PrismaService) {}

  /** 코드의 기본값. DB 에 행이 없는 잡은 이것으로 돈다. */
  private fallback(name: OpsScheduledJobName): Row {
    return { enabled: true, hours: [...OPS_SCHEDULED_JOBS[name].defaultHours], updatedAt: null };
  }

  private async refresh(): Promise<void> {
    if (Date.now() - this.loadedAt < CACHE_MS) return;

    const rows = await this.prisma.jobSchedule.findMany();
    const next = new Map<OpsScheduledJobName, Row>();
    for (const name of OPS_SCHEDULED_JOB_NAMES) next.set(name, this.fallback(name));

    for (const row of rows) {
      // 목록에서 빠진 잡의 옛 행은 무시한다. 기본값도 목록도 코드가 갖는다.
      if (!next.has(row.jobName as OpsScheduledJobName)) continue;
      next.set(row.jobName as OpsScheduledJobName, {
        enabled: row.enabled,
        hours: normalizeHours(row.hours),
        updatedAt: row.updatedAt,
      });
    }

    this.cache = next;
    this.loadedAt = Date.now();
  }

  private async row(name: OpsScheduledJobName): Promise<Row> {
    await this.refresh();
    return this.cache.get(name) ?? this.fallback(name);
  }

  /** 지금(KST 정각) 돌아야 하는 잡. 꺼져 있으면 나오지 않는다. */
  async dueAt(now: Date): Promise<OpsScheduledJobName[]> {
    await this.refresh();
    const hour = kstHour(now);
    return OPS_SCHEDULED_JOB_NAMES.filter((name) => {
      const row = this.cache.get(name) ?? this.fallback(name);
      return row.enabled && row.hours.includes(hour);
    });
  }

  /** `/ops` 의 배치 표가 쓰는 것 — 꺼진 잡을 "늦었다" 고 하지 않기 위해 필요하다. */
  async state(name: OpsScheduledJobName): Promise<{ enabled: boolean; hours: number[] }> {
    const { enabled, hours } = await this.row(name);
    return { enabled, hours };
  }

  async all(): Promise<OpsJobSchedule[]> {
    await this.refresh();
    return OPS_SCHEDULED_JOB_NAMES.map((name) => {
      const def = OPS_SCHEDULED_JOBS[name];
      const row = this.cache.get(name) ?? this.fallback(name);
      return {
        name,
        label: def.label,
        description: def.description,
        offNote: def.offNote,
        enabled: row.enabled,
        hours: row.hours,
        defaultHours: [...def.defaultHours],
        isDefault: row.enabled && sameHours(row.hours, def.defaultHours),
        updatedAt: row.updatedAt?.toISOString() ?? null,
      };
    });
  }

  /**
   * 운영자가 스위치와 시각을 바꾼다. 꺼도 시각은 남는다 — 다시 켤 때 고르던 것이 그대로 돌아온다.
   * 캐시를 바로 비우므로 다음 정각부터 새 시각이 걸린다.
   */
  async set(
    name: OpsScheduledJobName,
    input: { enabled: boolean; hours: number[] },
    updatedBy?: string,
  ): Promise<OpsJobSchedule> {
    const hours = normalizeHours(input.hours).slice(0, OPS_JOB_HOURS_MAX);
    await this.prisma.jobSchedule.upsert({
      where: { jobName: name },
      update: { enabled: input.enabled, hours, updatedBy: updatedBy ?? null },
      create: { jobName: name, enabled: input.enabled, hours, updatedBy: updatedBy ?? null },
    });
    this.invalidate();
    const all = await this.all();
    return all.find((row) => row.name === name) as OpsJobSchedule;
  }

  invalidate(): void {
    this.loadedAt = 0;
  }
}

/** KST 의 시(0~23). 프로세스 TZ 에 기대지 않는다(weekend.ts 와 같은 방식이다). */
export function kstHour(now: Date): number {
  return new Date(now.getTime() + KST_OFFSET_MS).getUTCHours();
}

/** 정수 0~23 만, 중복 없이, 오름차순. 바깥에서 온 것과 옛 행을 모두 여기서 씻는다. */
export function normalizeHours(hours: number[]): number[] {
  const seen = new Set<number>();
  for (const value of hours) {
    if (!Number.isInteger(value) || value < 0 || value > 23) continue;
    seen.add(value);
  }
  return [...seen].sort((a, b) => a - b);
}

function sameHours(a: number[], b: readonly number[]): boolean {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}
