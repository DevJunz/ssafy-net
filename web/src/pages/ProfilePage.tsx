import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { api } from '../api/client';
import {
  Chips,
  ChipTag,
  Muted,
  Page,
  PageLede,
  PageTitle,
  ScrollPage,
  SectionTitle,
  Tag,
} from '../components/primitives';
import { InterestPicker } from '../features/interests/InterestPicker';
import { MyPosts } from '../features/posts/MyPosts';
import { AccountSection } from '../features/profile/AccountSection';
import { DisplayNameForm } from '../features/profile/DisplayNameForm';
import { NotificationPrefsForm } from '../features/profile/NotificationPrefsForm';
import { ProfileMessageForm } from '../features/profile/ProfileMessageForm';
import { RealNameForm } from '../features/profile/RealNameForm';
import { useSession } from '../session';

/** "9월 11일 오후 2:20" — 다음 변경 가능 시각 안내에 쓴다. */
const formatWhen = (date: Date) =>
  date.toLocaleString('ko-KR', {
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });

/**
 * My Profile (docs/06 §3.10).
 *
 * 남에게 보이는 모습을 "연결 전 / 연결 후" 두 가지로 미리 보여준다.
 * 표시명 선택의 결과를 여기서 실감하게 하는 것이 목적이다.
 *
 * 표시명(닉네임 ↔ 실명, 닉네임 바꾸기)은 하루 1회(docs/12 §3).
 * 실명(이름·반)은 언제든 고친다 — 연결된 상대에게 보이는 이름이라 오타를 막지 않는다.
 * 관심사 수정은 온보딩과 같은 화면을 쓴다(D-24).
 */
export function ProfilePage() {
  const { me, reload } = useSession();
  const [editingName, setEditingName] = useState(false);
  const [editingInterests, setEditingInterests] = useState(false);
  const [editingRealName, setEditingRealName] = useState(false);
  const [editingMessage, setEditingMessage] = useState(false);

  if (!me) return null;

  // 하루 1회 규칙. 서버가 다음 변경 가능 시각을 준다(지금 되면 null).
  const nextChangeAt = me.displayNameChangeableAt
    ? new Date(me.displayNameChangeableAt)
    : null;
  const blockedReason =
    nextChangeAt && nextChangeAt.getTime() > Date.now()
      ? `표시명은 하루에 한 번 바꿀 수 있습니다. ${formatWhen(nextChangeAt)} 이후에 다시 바꿀 수 있습니다.`
      : null;

  return (
    <ScrollPage>
      <Page>
        <PageTitle>내 프로필</PageTitle>
        <PageLede>
          관심사는 조직 구성원 전체에게 보입니다. 실명은 연결이 성립될 때만
          공개됩니다.
        </PageLede>

        {/* "연결 전 / 연결 후" 두 장. 좁으면 세로로 쌓인다. */}
        <div className="grid grid-cols-2 gap-3 max-sm:grid-cols-1">
          <Card className="gap-0 rounded-xl py-[22px] max-sm:py-[18px]">
            <CardContent className="px-6 max-sm:px-[18px]">
              <Muted>연결 전에 보이는 모습</Muted>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-[17px] font-semibold tracking-tight">
                {me.displayName}
                {me.displayNameType === 'REAL' && <Tag tone="real">실명</Tag>}
              </div>
              {me.profileMessage && (
                <p className="mt-1 mb-0 text-[13px] leading-snug whitespace-pre-wrap text-foreground/80">
                  {me.profileMessage}
                </p>
              )}
              <Muted className="text-[12.5px]">관심사 {me.interests.length}개</Muted>
            </CardContent>
          </Card>

          <Card className="gap-0 rounded-xl py-[22px] max-sm:py-[18px]">
            <CardContent className="px-6 max-sm:px-[18px]">
              <Muted>연결된 상대에게 보이는 모습</Muted>
              <div className="mt-1 text-[17px] font-semibold tracking-tight">
                {me.realName}
              </div>
              <Muted className="text-[12.5px]">관심사 {me.interests.length}개</Muted>
            </CardContent>
          </Card>
        </div>

        <div className="mt-6">
          <SectionTitle>표시명</SectionTitle>
          <Muted>
            닉네임으로 활동할지 실명으로 활동할지 고르고, 닉네임도 여기서 바꿉니다.
            바꾸면 진행 중인 요청의 상대와 추천 목록에도 새 표시명이 보입니다.
            하루에 한 번 바꿀 수 있습니다.
          </Muted>
          {editingName ? (
            <div className="mt-3">
              <DisplayNameForm
                realNamePreview={me.realName || null}
                initial={{
                  type: me.displayNameType,
                  nickname:
                    me.displayNameType === 'NICKNAME' ? me.displayName : null,
                }}
                submitLabel="저장"
                blockedReason={blockedReason}
                onSubmit={async (input) => {
                  await api.patch('/me/display-name', input);
                  await reload();
                  setEditingName(false);
                  toast.success('표시명을 바꿨습니다.');
                }}
                onCancel={() => setEditingName(false)}
              />
            </div>
          ) : (
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <span className="text-[15px] font-semibold">
                {me.displayNameType === 'REAL' ? '실명으로 활동 중' : '닉네임으로 활동 중'}
                {me.displayNameType === 'NICKNAME' && (
                  <span className="ml-1.5 font-normal text-muted-foreground">
                    {me.displayName}
                  </span>
                )}
              </span>
              <Button
                type="button"
                variant="outline"
                onClick={() => setEditingName(true)}
              >
                표시명 바꾸기
              </Button>
            </div>
          )}
        </div>

        <div className="mt-6">
          <SectionTitle>프로필 메시지</SectionTitle>
          <Muted>
            나를 눌렀을 때 표시명 아래에 보이는 한 줄입니다. 무엇을 이야기하고 싶은지
            적어 두면 상대가 요청 메시지를 쓰기 쉬워집니다.
          </Muted>
          {editingMessage ? (
            <div className="mt-3">
              <ProfileMessageForm
                initial={me.profileMessage}
                onSubmit={async (message) => {
                  await api.patch('/me/profile-message', { message });
                  await reload();
                  setEditingMessage(false);
                  toast.success(message ? '프로필 메시지를 저장했습니다.' : '프로필 메시지를 지웠습니다.');
                }}
                onCancel={() => setEditingMessage(false)}
              />
            </div>
          ) : (
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <span className="text-[15px] whitespace-pre-wrap">
                {me.profileMessage || <span className="text-muted-foreground">아직 없음</span>}
              </span>
              <Button
                type="button"
                variant="outline"
                onClick={() => setEditingMessage(true)}
              >
                {me.profileMessage ? '메시지 수정' : '메시지 쓰기'}
              </Button>
            </div>
          )}
        </div>

        <div className="mt-6">
          <SectionTitle>실명</SectionTitle>
          <Muted>
            연결이 성립된 상대에게 보이는 이름입니다. 실명으로 활동 중이면 처음부터
            보입니다. 이름과 반을 고칠 수 있습니다.
          </Muted>
          {editingRealName ? (
            <div className="mt-3">
              <RealNameForm
                initial={{
                  realName: me.identity.realName ?? '',
                  classNo: me.identity.classNo ?? '',
                }}
                onSubmit={async (input) => {
                  await api.patch('/me/real-name', input);
                  await reload();
                  setEditingRealName(false);
                  toast.success('실명을 바꿨습니다.');
                }}
                onCancel={() => setEditingRealName(false)}
              />
            </div>
          ) : (
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <span className="text-[15px] font-semibold">{me.realName || '아직 없음'}</span>
              <Button
                type="button"
                variant="outline"
                onClick={() => setEditingRealName(true)}
              >
                실명 수정
              </Button>
            </div>
          )}
        </div>

        <div className="mt-6">
          <SectionTitle>알림</SectionTitle>
          <Muted>
            메신저(Mattermost)로 받을 알림을 고릅니다. 끄면 앱 알림함에만 쌓입니다.
          </Muted>
          <NotificationPrefsForm />
        </div>

        <div className="mt-6">
          <SectionTitle>내가 쓴 글</SectionTitle>
          <MyPosts />
        </div>

        <div className="mt-6">
          <SectionTitle>관심사</SectionTitle>
          <Muted>
            그래프와 추천의 재료입니다. 저장하면 그래프와 추천이 즉시 바뀝니다.
          </Muted>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Chips>
              {me.interests.map((interest) => (
                <ChipTag key={interest.id}>{interest.name}</ChipTag>
              ))}
            </Chips>
            <Button
              type="button"
              variant="outline"
              className="ml-1"
              onClick={() => setEditingInterests(true)}
            >
              관심사 수정
            </Button>
          </div>
        </div>

        <div className="mt-6">
          <SectionTitle>계정</SectionTitle>
          <Muted>
            로그인에 쓴 Google 계정입니다. 다른 구성원에게는 보이지 않습니다.
          </Muted>
          <AccountSection />
        </div>

        {/*
         * 온보딩과 같은 선택 화면(D-24)이지만, 본문 폭(760px) 안의 상자에 넣으면
         * 100개를 좁은 칸에서 스크롤해야 한다. 화면을 거의 다 쓰는 대화상자로 열어
         * 분류를 여러 단으로 늘어놓으면 한 번에 다 보인다.
         * ResponsiveDialog(520px)로는 이 폭이 안 나와 Dialog 를 직접 쓴다.
         */}
        {editingInterests && (
          <Dialog
            open
            onOpenChange={(open) => {
              if (!open) setEditingInterests(false);
            }}
          >
            <DialogContent className="flex h-[94dvh] max-w-[min(1440px,96vw)] flex-col gap-0 overflow-hidden p-0 sm:max-w-[min(1440px,96vw)]">
              {/* 제목과 안내를 한 줄에 둔다. 목록에 높이를 한 뼘이라도 더 준다. */}
              <DialogHeader className="flex-row flex-wrap items-baseline gap-x-3 gap-y-1 border-b px-6 py-3 pr-14">
                <DialogTitle className="text-[17px] leading-snug">관심사 수정</DialogTitle>
                <DialogDescription className="text-[13px]">
                  저장하면 그래프와 추천이 즉시 바뀝니다.
                </DialogDescription>
              </DialogHeader>
              <div className="min-h-0 flex-1">
                <InterestPicker
                  variant="overlay"
                  submitLabel="저장"
                  onSaved={async (message) => {
                    await reload();
                    setEditingInterests(false);
                    toast.success(message ?? '관심사를 저장했습니다.');
                  }}
                  onCancel={() => setEditingInterests(false)}
                />
              </div>
            </DialogContent>
          </Dialog>
        )}
      </Page>
    </ScrollPage>
  );
}
