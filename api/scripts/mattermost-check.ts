/**
 * Mattermost 웹훅 진단 (docs/18 B-3의 대체 경로).
 *
 * SSAFY Mattermost는 Team Edition이고 개인 액세스 토큰과 봇 계정이 막혀 있다.
 * 쓸 수 있는 것은 **들어오는 웹훅**뿐이라 프로필 조회는 불가능하고 발송만 된다.
 *
 * 이 스크립트는 회원님에게만 메시지를 보낸다.
 *   1) 목적지 없이 → 웹훅의 기본 채널(비공개 로그 채널)
 *   2) @본인 → 웹훅 생성자에게 DM이 가는지 (문서상 불가. 실제 동작을 확인한다)
 *
 * 실행: npm run mm:check --workspace=api
 */
import { config } from 'dotenv';
import { SERVICE_NAME } from '@ssafy-net/shared';

config();

const WEBHOOK = process.env.MATTERMOST_WEBHOOK_URL ?? '';
const OPERATOR = process.env.MATTERMOST_OPERATOR_USERNAME ?? 'devjunsday';

interface Payload {
  text: string;
  channel?: string;
  username?: string;
}

async function send(label: string, payload: Payload) {
  const response = await fetch(WEBHOOK, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const body = (await response.text()).slice(0, 200);
  const ok = response.status === 200;
  console.log(`${ok ? 'OK  ' : '실패'} ${label}`);
  console.log(`     [${response.status}] ${body}`);
  return ok;
}

async function main() {
  if (!WEBHOOK) {
    console.error('MATTERMOST_WEBHOOK_URL 을 api/.env 에 넣어주세요.');
    process.exitCode = 1;
    return;
  }
  console.log(`웹훅 ${WEBHOOK.replace(/\/hooks\/.+$/, '/hooks/<가려짐>')}\n`);

  // 1. 기본 채널로. 웹훅 자체가 살아 있는지 본다.
  await send('기본 채널로 발송 (목적지 미지정)', {
    text: [
      `**${SERVICE_NAME} — 웹훅 연결 확인**`,
      '',
      '이 메시지가 보이면 웹훅이 살아 있습니다.',
      '이 채널은 목적지를 지정하지 않았을 때만 쓰입니다.',
    ].join('\n'),
  });

  console.log('');

  // 2. 본인에게 DM. 문서상 "웹훅은 생성자에게 DM할 수 없다"인데 실제로 확인한다.
  //    여기서 되면 운영자 예외 경로가 필요 없어진다.
  await send(`@${OPERATOR} 에게 DM (웹훅 생성자 본인)`, {
    channel: `@${OPERATOR}`,
    text: [
      `**${SERVICE_NAME} 인증 코드**`,
      '',
      '최준환_서울_18반님, 인증 코드는 `482913` 입니다.',
      '10분 안에 입력해주세요.',
      '',
      '_이름이 다르면 입력을 잘못하신 것입니다._',
    ].join('\n'),
  });

  console.log('');
  console.log('Mattermost에서 두 곳을 확인해주세요.');
  console.log('  - 비공개 로그 채널: 1번 메시지');
  console.log('  - 본인과의 대화: 2번 메시지 (안 오면 생성자 DM 제약이 실재)');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
