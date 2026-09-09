import {
  INTEREST_NAME_MAX,
  type CreatedInterest,
  type InterestCategory,
  type SimilarInterest,
} from '@ssafy-net/shared';
import { useEffect, useState } from 'react';
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
import { api, RequestFailed } from '../../api/client';
import { Chip, Chips, ErrorText, Muted } from '../../components/primitives';

/**
 * 관심사 직접 추가 (D-74).
 *
 * 자유 입력은 "백엔드/백앤드/Backend"처럼 같은 뜻을 흩뜨린다(docs/08 §1).
 * 그래서 만들기 전에 두 번 묻는다.
 *   1. 입력 중 — 서버가 비슷한 기존 관심사를 보여주고, 그것을 고르면 만들지 않는다
 *   2. 추가 버튼 — 서버가 다시 검사해 같은 뜻이면 막고(INTEREST_EXISTS),
 *      비슷하면 확인을 받는다(INTEREST_SIMILAR → "그래도 추가")
 *
 * 만들어진 관심사는 곧바로 선택 목록에 들어가지만, 저장은 사용자가 한다.
 */
export function CreateInterest({
  initialName,
  categories,
  onCreated,
  onPickExisting,
  onClose,
}: {
  initialName: string;
  /** 이야깃거리 분류만. 층 같은 속성 분류에는 추가할 수 없다. */
  categories: InterestCategory[];
  onCreated: (interest: CreatedInterest) => void;
  onPickExisting: (interestId: string) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState(initialName);
  const [categoryId, setCategoryId] = useState(categories[0]?.id ?? '');
  const [similar, setSimilar] = useState<SimilarInterest[]>([]);
  const [needsConfirm, setNeedsConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const trimmed = name.trim();

  useEffect(() => {
    setNeedsConfirm(false);
    setError(null);
    if (trimmed.length < 1) {
      setSimilar([]);
      return;
    }
    const timer = setTimeout(() => {
      api
        .get<SimilarInterest[]>(`/interests/similar?q=${encodeURIComponent(trimmed)}`)
        .then(setSimilar)
        .catch(() => setSimilar([]));
    }, 250);
    return () => clearTimeout(timer);
  }, [trimmed]);

  const exact = similar.find((item) => item.match === 'EXACT');

  const submit = async (confirmSimilar: boolean) => {
    setBusy(true);
    setError(null);
    try {
      const created = await api.post<CreatedInterest>('/interests', {
        name: trimmed,
        categoryId,
        confirmSimilar,
      });
      onCreated(created);
    } catch (e) {
      if (e instanceof RequestFailed && e.code === 'INTEREST_SIMILAR') {
        const list = (e.details?.similar as SimilarInterest[] | undefined) ?? [];
        setSimilar(list);
        setNeedsConfirm(true);
      } else if (e instanceof RequestFailed && e.code === 'INTEREST_EXISTS') {
        const existing = e.details?.interest as SimilarInterest | undefined;
        setSimilar(existing ? [existing] : []);
        setError(e.message);
      } else {
        setError(e instanceof RequestFailed ? e.message : '추가하지 못했습니다.');
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="mt-4 gap-0 rounded-xl py-[22px]">
      <CardContent className="flex flex-col gap-4 px-6">
        <strong className="font-semibold">관심사 추가</strong>
        <Muted className="text-[13px]">
          처음 만난 사람과 10분쯤 이야기할 수 있는 주제면 됩니다. 추가하면 바로 다른
          구성원도 고를 수 있습니다.
        </Muted>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="new-interest-name" className="text-[13px] font-semibold text-foreground/70">
            이름
          </Label>
          <Input
            id="new-interest-name"
            type="text"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="예: 러스트, 사이클, 보드게임 카페"
            maxLength={INTEREST_NAME_MAX}
            autoFocus
            className="h-11"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="new-interest-category" className="text-[13px] font-semibold text-foreground/70">
            분류
          </Label>
          <Select value={categoryId} onValueChange={setCategoryId}>
            <SelectTrigger id="new-interest-category" className="w-full data-[size=default]:h-11">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {categories.map((category) => (
                <SelectItem key={category.id} value={category.id}>
                  {category.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {similar.length > 0 && (
          <div>
            <Muted className="mb-1.5 text-[13px]">
              {exact
                ? `"${exact.name}"이(가) 이미 있습니다. 이것을 고르세요.`
                : needsConfirm
                  ? '비슷한 관심사가 이미 있습니다. 같은 뜻이면 아래에서 고르고, 다르면 그래도 추가할 수 있습니다.'
                  : '혹시 이것인가요? 고르면 새로 만들지 않습니다.'}
            </Muted>
            <Chips>
              {similar.map((item) => (
                <Chip
                  key={item.id}
                  selected={item.match === 'EXACT'}
                  count={`${item.holderCount}명`}
                  onClick={() => onPickExisting(item.id)}
                >
                  {item.name}
                </Chip>
              ))}
            </Chips>
          </div>
        )}

        {error && <ErrorText>{error}</ErrorText>}

        <div className="flex gap-2">
          <Button type="button" variant="outline" onClick={onClose} disabled={busy}>
            취소
          </Button>
          {needsConfirm ? (
            <Button
              type="button"
              disabled={busy || trimmed.length < 1 || Boolean(exact)}
              onClick={() => void submit(true)}
            >
              그래도 “{trimmed}” 추가
            </Button>
          ) : (
            <Button
              type="button"
              disabled={busy || trimmed.length < 1 || Boolean(exact)}
              onClick={() => void submit(false)}
            >
              추가하기
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
