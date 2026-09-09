import { CAMPUS, CLASS_OPTIONS } from '@ssafy-net/shared';
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
import { api, RequestFailed } from '../../api/client';
import { ErrorText, Muted, Notice } from '../../components/primitives';

/**
 * Mattermost 계정 인증 (D-66).
 *
 * 온보딩의 첫 단계다. 여기서 막히면 뒤의 단계가 의미가 없다 —
 * 소속이 확인되지 않은 사람이 관심사를 고르게 하지 않는다.
 *
 * 이 한 단계가 두 가지를 한다.
 *   1. SSAFY 소속 검증 (계정이 있는 사람만 가입할 수 있다)
 *   2. 알림 채널 확보 (이후 모든 알림이 이 계정으로 간다)
 *
 * 실명을 같이 받는 이유는 DM 본문에 넣어 오타를 잡기 위해서다.
 */
export function MattermostStep({
  initialUsername,
  codeAlreadySent,
  onDone,
}: {
  initialUsername: string | null;
  codeAlreadySent: boolean;
  onDone: () => void;
}) {
  const [username, setUsername] = useState(initialUsername ?? '');
  const [realName, setRealName] = useState('');
  const [classNo, setClassNo] = useState('');
  const [code, setCode] = useState('');
  const [sent, setSent] = useState(codeAlreadySent);
  // 데모 빌드에서는 DM이 갈 곳이 없으므로 코드를 화면에 알려준다.
  const [demoCode, setDemoCode] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const preview =
    realName && classNo ? `${realName}_${CAMPUS}_${classNo}` : `이름_${CAMPUS}_반`;

  const send = async () => {
    setBusy(true);
    setError(null);
    try {
      const result = await api.post<{
        operatorBypass: boolean;
        demoCode?: string;
      }>('/onboarding/mattermost/send', {
        username: username.trim(),
        realName,
        classNo,
      });
      setDemoCode(result.demoCode ?? null);
      // 운영자(웹훅 생성자)는 자기 자신에게 DM을 받을 수 없어 코드 없이 통과한다.
      if (result.operatorBypass) {
        onDone();
        return;
      }
      setSent(true);
    } catch (e) {
      setError(e instanceof RequestFailed ? e.message : '보내지 못했습니다.');
    } finally {
      setBusy(false);
    }
  };

  const verify = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.post('/onboarding/mattermost/verify', { code: code.trim() });
      onDone();
    } catch (e) {
      setError(e instanceof RequestFailed ? e.message : '확인하지 못했습니다.');
    } finally {
      setBusy(false);
    }
  };

  if (sent) {
    return (
      <div className="flex flex-col gap-4">
        <h2 className="text-xl">Mattermost로 코드를 보냈습니다</h2>
        <Muted>
          <strong className="font-semibold text-foreground">
            @{username.replace(/^@/, '')}
          </strong>{' '}
          님에게 6자리 코드를 보냈습니다. Mattermost를 확인해주세요.
        </Muted>

        {demoCode && (
          <Notice>
            데모라 메신저로 보내지 않았습니다.{' '}
            <strong className="font-semibold text-foreground">{demoCode}</strong> 을
            입력해주세요.
          </Notice>
        )}

        {/* 인증 코드처럼 숫자만 받는 큰 입력 */}
        <Input
          type="text"
          value={code}
          onChange={(event) => setCode(event.target.value.replace(/\D/g, ''))}
          placeholder="000000"
          maxLength={6}
          inputMode="numeric"
          autoComplete="one-time-code"
          className="h-14 bg-card pl-[calc(12px+0.35em)] text-center text-2xl font-semibold tracking-[0.35em] md:text-2xl"
        />

        {error && <ErrorText>{error}</ErrorText>}

        <Button
          type="button"
          size="lg"
          className="self-start"
          disabled={code.length !== 6 || busy}
          onClick={() => void verify()}
        >
          확인
        </Button>

        <Button
          type="button"
          variant="outline"
          className="self-start"
          onClick={() => {
            setSent(false);
            setCode('');
          }}
        >
          아이디를 다시 입력할게요
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-xl">Mattermost 계정을 알려주세요</h2>
      <Muted>
        SSAFY 구성원인지 확인하고, 앞으로 알림을 이 계정으로 보내드립니다.
      </Muted>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="mm-username" className="text-[13px] font-semibold text-foreground/70">
          Mattermost 아이디
        </Label>
        <Input
          id="mm-username"
          type="text"
          value={username}
          onChange={(event) => setUsername(event.target.value)}
          placeholder="mattermost_id"
          autoComplete="off"
          className="h-11 bg-card"
        />
        <Muted className="text-xs">
          표시명(홍길동[서울_1반])이 아니라{' '}
          <strong className="font-semibold text-foreground">@아이디</strong>입니다.
          Mattermost에서 본인 프로필을 누르면 보입니다.
        </Muted>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="mm-realname" className="text-[13px] font-semibold text-foreground/70">
          이름
        </Label>
        <Input
          id="mm-realname"
          type="text"
          value={realName}
          onChange={(event) => setRealName(event.target.value)}
          placeholder="홍길동"
          className="h-11 bg-card"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="mm-class" className="text-[13px] font-semibold text-foreground/70">
          반
        </Label>
        {/* 자유 입력이면 "18", "18반", "십팔반"이 섞인다. 실명 표기의 일부라 고르게 한다(D-73). */}
        <Select value={classNo} onValueChange={setClassNo}>
          <SelectTrigger id="mm-class" className="h-11 w-full bg-card data-[size=default]:h-11">
            <SelectValue placeholder="반을 골라주세요" />
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

      <Card className="gap-0 rounded-xl py-[22px]">
        <CardContent className="px-6">
          <Muted>연결이 성립되면 이렇게 보입니다</Muted>
          <div className="mt-1 text-[17px] font-semibold tracking-tight">{preview}</div>
        </CardContent>
      </Card>

      {error && <ErrorText>{error}</ErrorText>}

      <Button
        type="button"
        size="lg"
        className="self-start"
        disabled={
          username.trim().length < 3 ||
          !realName.trim() ||
          !classNo.trim() ||
          busy
        }
        onClick={() => void send()}
      >
        인증 코드 받기
      </Button>
    </div>
  );
}
