import { CAMPUS, CLASS_OPTIONS, type IdentityInput } from '@ssafy-net/shared';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { RequestFailed } from '../../api/client';
import { ErrorText, Muted } from '../../components/primitives';

/**
 * 실명 수정 폼 (docs/06 §3.10 "실명 수정").
 *
 * 온보딩 1단계(MattermostStep)에서 적은 것과 같은 둘 — 이름, 반. 캠퍼스는 고정이다(D-47).
 * 실명은 연결이 성립된 상대에게 보이고, 실명으로 활동 중이면 표시명이기도 하다.
 * 하루 1회 규칙은 표시명 선택에만 걸린다(docs/12 §3) — 오타를 고치는 일을 막지 않는다.
 */
export function RealNameForm({
  initial,
  onSubmit,
  onCancel,
}: {
  initial: { realName: string; classNo: string };
  onSubmit: (input: IdentityInput) => Promise<void>;
  onCancel: () => void;
}) {
  const [realName, setRealName] = useState(initial.realName);
  const [classNo, setClassNo] = useState(initial.classNo);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const trimmed = realName.trim();
  const valid = trimmed.length >= 1 && trimmed.length <= 20 && classNo !== '';
  const unchanged = trimmed === initial.realName && classNo === initial.classNo;
  const preview =
    trimmed && classNo ? `${trimmed}_${CAMPUS}_${classNo}` : `이름_${CAMPUS}_반`;

  const submit = async () => {
    if (!valid) return;
    setSaving(true);
    setError(null);
    try {
      await onSubmit({ realName: trimmed, classNo });
    } catch (e) {
      setError(e instanceof RequestFailed ? e.message : '저장에 실패했습니다.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-[1fr_150px] gap-3 max-sm:grid-cols-1">
        <div className="flex flex-col gap-1.5">
          <Label
            htmlFor="real-name"
            className="text-[13px] font-semibold text-foreground/70"
          >
            이름
          </Label>
          <Input
            id="real-name"
            type="text"
            value={realName}
            onChange={(event) => setRealName(event.target.value)}
            placeholder="홍길동"
            maxLength={20}
            autoComplete="off"
            className="h-11 bg-card"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label
            htmlFor="real-class"
            className="text-[13px] font-semibold text-foreground/70"
          >
            반
          </Label>
          {/* 자유 입력이면 표기가 섞인다. 실명 표기의 일부라 고르게 한다(D-73). */}
          <Select value={classNo} onValueChange={setClassNo}>
            <SelectTrigger
              id="real-class"
              className="h-11 w-full bg-card data-[size=default]:h-11"
            >
              <SelectValue placeholder="반" />
            </SelectTrigger>
            <SelectContent>
              {CLASS_OPTIONS.map((option) => (
                <SelectItem key={option} value={option}>
                  {option}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <Card className="gap-0 rounded-xl py-4">
        <CardContent className="px-5">
          <Muted>연결된 상대에게 이렇게 보입니다</Muted>
          <div className="mt-1 text-[17px] font-semibold tracking-tight">{preview}</div>
        </CardContent>
      </Card>

      {error && <ErrorText>{error}</ErrorText>}

      <div className="flex gap-2">
        <Button
          type="button"
          size="lg"
          disabled={!valid || unchanged || saving}
          onClick={() => void submit()}
        >
          저장
        </Button>
        <Button type="button" size="lg" variant="outline" onClick={onCancel}>
          취소
        </Button>
      </div>
    </div>
  );
}
