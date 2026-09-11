import { Injectable } from '@nestjs/common';
import {
  DEFAULT_PARAMETERS,
  FEATURE_FLAGS,
  PARAMETER_DEFS,
  type FeatureFlagKey,
  type FeatureFlagMap,
  type ParameterKey,
  type ParameterMap,
} from '@ssafy-net/shared';
import { PrismaService } from '../../infra/prisma/prisma.service';

const CACHE_MS = 30_000;

const DEFAULT_FLAGS = Object.fromEntries(
  Object.entries(FEATURE_FLAGS).map(([key, def]) => [key, def.enabled]),
) as FeatureFlagMap;

/**
 * Product Parameter는 DB에 있다(design/20 §9).
 * 공개 3일째 P-03을 낮추는 판단(docs/13 §3.3)과 Network 게이트에 따른 P-04 조정
 * (docs/10 §4)이 이미 예정되어 있어 배포 없이 바꿀 수 있어야 한다.
 *
 * 30초 캐시를 두는 이유는 값이 거의 안 바뀌면서 거의 모든 요청이 읽기 때문이다.
 * 운영자가 값을 바꾸면 늦어도 30초 뒤에 반영된다.
 */
@Injectable()
export class ParametersService {
  private parameters: ParameterMap = { ...DEFAULT_PARAMETERS };
  private flags: FeatureFlagMap = { ...DEFAULT_FLAGS };
  private loadedAt = 0;

  constructor(private readonly prisma: PrismaService) {}

  private async refresh(): Promise<void> {
    if (Date.now() - this.loadedAt < CACHE_MS) return;

    const [rows, flags] = await Promise.all([
      this.prisma.appParameter.findMany(),
      this.prisma.featureFlag.findMany(),
    ]);

    const next = { ...DEFAULT_PARAMETERS };
    for (const row of rows) {
      if (row.key in next) next[row.key as ParameterKey] = row.value;
    }

    const nextFlags = { ...DEFAULT_FLAGS };
    for (const flag of flags) {
      if (flag.key in nextFlags) {
        nextFlags[flag.key as FeatureFlagKey] = flag.enabled;
      }
    }

    this.parameters = next;
    this.flags = nextFlags;
    this.loadedAt = Date.now();
  }

  async get(key: ParameterKey): Promise<number> {
    await this.refresh();
    return this.parameters[key];
  }

  async all(): Promise<ParameterMap> {
    await this.refresh();
    return { ...this.parameters };
  }

  async flag(key: FeatureFlagKey): Promise<boolean> {
    await this.refresh();
    return this.flags[key];
  }

  async allFlags(): Promise<FeatureFlagMap> {
    await this.refresh();
    return { ...this.flags };
  }

  /**
   * 운영자가 기능을 켜고 끈다(D-78). 캐시를 바로 비워 다음 요청부터 반영된다.
   * 이 서비스는 모듈 싱글턴이라 여기서 비우면 ExposureService 가 보는 값도 같이 바뀐다.
   */
  async setFlag(key: FeatureFlagKey, enabled: boolean): Promise<void> {
    await this.prisma.featureFlag.upsert({
      where: { key },
      update: { enabled },
      create: { key, enabled, note: FEATURE_FLAGS[key].note },
    });
    this.invalidate();
  }

  /**
   * 운영자가 값을 바꾼다(D-91). `/ops` 의 Network 구역에서 P-04·P-01 을 이걸로 쓴다.
   *
   * `app_parameter_change` 에 한 줄을 남긴다 — 스키마에 처음부터 있던 자리다. 나중에
   * "추천이 갑자기 늘었는데 언제부터였나"를 `analytics_event.occurred_at` 과 맞춰 보려면
   * 값이 바뀐 시각이 남아 있어야 한다.
   *
   * 캐시를 바로 비우므로 다음 요청부터 새 값이 보인다 — 30초를 기다리지 않는다.
   * 돌려주는 것은 **바뀌기 전 값**이다.
   */
  async setParameter(
    key: ParameterKey,
    value: number,
    options: { updatedBy?: string; reason?: string } = {},
  ): Promise<number> {
    const before = await this.get(key);
    if (before === value) return before;

    await this.prisma.$transaction([
      this.prisma.appParameter.upsert({
        where: { key },
        update: { value, updatedBy: options.updatedBy ?? null },
        create: {
          key,
          value,
          label: PARAMETER_DEFS[key].label,
          updatedBy: options.updatedBy ?? null,
        },
      }),
      this.prisma.appParameterChange.create({
        data: {
          key,
          oldValue: before,
          newValue: value,
          reason: options.reason ?? null,
        },
      }),
    ]);

    this.invalidate();
    return before;
  }

  invalidate(): void {
    this.loadedAt = 0;
  }
}
