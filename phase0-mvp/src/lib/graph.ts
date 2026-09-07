import type { NodeObject, LinkObject } from 'react-force-graph-2d';
import {
  ME_ID,
  interests,
  users,
  userInterests,
  networkSuggestions,
  type Interest,
  type User,
} from '../data/mock';

// ---------- 조회 헬퍼 ----------

export const interestById = new Map<string, Interest>(interests.map((i) => [i.id, i]));
export const userById = new Map<string, User>(users.map((u) => [u.id, u]));

const interestsByUser = new Map<string, string[]>();
const usersByInterest = new Map<string, string[]>();
for (const ui of userInterests) {
  interestsByUser.set(ui.userId, [...(interestsByUser.get(ui.userId) ?? []), ui.interestId]);
  usersByInterest.set(ui.interestId, [...(usersByInterest.get(ui.interestId) ?? []), ui.userId]);
}

export function interestsOf(userId: string): string[] {
  return interestsByUser.get(userId) ?? [];
}

export function usersOf(interestId: string): string[] {
  return usersByInterest.get(interestId) ?? [];
}

export function commonInterests(a: string, b: string): string[] {
  const setB = new Set(interestsOf(b));
  return interestsOf(a).filter((i) => setB.has(i));
}

export type SimilarPerson = { userId: string; common: string[] };

export function similarPeople(userId: string, min = 3): SimilarPerson[] {
  return users
    .filter((u) => u.id !== userId)
    .map((u) => ({ userId: u.id, common: commonInterests(userId, u.id) }))
    .filter((s) => s.common.length >= min)
    .sort((a, b) => b.common.length - a.common.length);
}

export function networkById(id: string) {
  return networkSuggestions.find((n) => n.id === id);
}

// ---------- 그래프 데이터 ----------

export type GNode = {
  id: string;
  kind: 'person' | 'interest';
  name: string;
  color: string;
  isMe: boolean;
};

export type GLink = {
  id: string;
  kind: 'membership' | 'similar' | 'network';
  common: string[]; // person-person edge일 때 공통 관심사 id
};

export type GraphNode = NodeObject<GNode>;
export type GraphLink = LinkObject<GNode, GLink>;

export function endpointId(end: GraphLink['source']): string {
  return typeof end === 'object' && end !== null ? String(end.id) : String(end);
}

// 노드/링크 객체는 force-graph가 위치를 기록하므로 한 번만 만들어 재사용한다.
export const baseNodes: GraphNode[] = [
  ...interests.map<GraphNode>((i) => ({
    id: i.id,
    kind: 'interest',
    name: i.name,
    color: i.color,
    isMe: false,
  })),
  ...users.map<GraphNode>((u) => ({
    id: u.id,
    kind: 'person',
    name: u.name,
    color: u.id === ME_ID ? '#e03131' : '#495057',
    isMe: u.id === ME_ID,
  })),
];

export const membershipLinkId = (userId: string, interestId: string) => `m:${userId}-${interestId}`;

export const baseLinks: GraphLink[] = userInterests.map<GraphLink>((ui) => ({
  id: membershipLinkId(ui.userId, ui.interestId),
  kind: 'membership',
  common: [],
  source: ui.userId,
  target: ui.interestId,
}));

export function buildSimilarLinks(): GraphLink[] {
  return similarPeople(ME_ID).map<GraphLink>((s) => ({
    id: `s:${ME_ID}-${s.userId}`,
    kind: 'similar',
    common: s.common,
    source: ME_ID,
    target: s.userId,
  }));
}

export function buildNetworkLinks(networkId: string): GraphLink[] {
  const net = networkById(networkId);
  if (!net) return [];
  const links: GraphLink[] = [];
  for (let i = 0; i < net.memberIds.length; i++) {
    for (let j = i + 1; j < net.memberIds.length; j++) {
      const a = net.memberIds[i];
      const b = net.memberIds[j];
      links.push({
        id: `n:${a}-${b}`,
        kind: 'network',
        common: net.commonInterestIds,
        source: a,
        target: b,
      });
    }
  }
  return links;
}

// ---------- Focus / 강조 ----------

export type Mode =
  | { type: 'explore' }
  | { type: 'person'; id: string }
  | { type: 'interest'; id: string }
  | { type: 'similar'; focusId?: string }
  | { type: 'network'; id: string };

export type Focus = {
  active: boolean;
  nodes: Set<string>;
  links: Set<string>;
  emphasisLink?: string;
};

export function computeFocus(mode: Mode): Focus {
  const nodes = new Set<string>();
  const links = new Set<string>();

  switch (mode.type) {
    case 'explore':
      return { active: false, nodes, links };

    case 'person': {
      nodes.add(mode.id);
      for (const iid of interestsOf(mode.id)) {
        nodes.add(iid);
        links.add(membershipLinkId(mode.id, iid));
      }
      return { active: true, nodes, links };
    }

    case 'interest': {
      nodes.add(mode.id);
      for (const uid of usersOf(mode.id)) {
        nodes.add(uid);
        links.add(membershipLinkId(uid, mode.id));
      }
      return { active: true, nodes, links };
    }

    case 'similar': {
      nodes.add(ME_ID);
      const sims = similarPeople(ME_ID);
      for (const s of sims) {
        nodes.add(s.userId);
        links.add(`s:${ME_ID}-${s.userId}`);
      }
      let emphasisLink: string | undefined;
      if (mode.focusId) {
        const target = sims.find((s) => s.userId === mode.focusId);
        if (target) {
          emphasisLink = `s:${ME_ID}-${target.userId}`;
          for (const iid of target.common) {
            nodes.add(iid);
            links.add(membershipLinkId(ME_ID, iid));
            links.add(membershipLinkId(target.userId, iid));
          }
        }
      }
      return { active: true, nodes, links, emphasisLink };
    }

    case 'network': {
      const net = networkById(mode.id);
      if (!net) return { active: false, nodes, links };
      for (const uid of net.memberIds) {
        nodes.add(uid);
        for (const iid of net.commonInterestIds) {
          nodes.add(iid);
          links.add(membershipLinkId(uid, iid));
        }
      }
      for (const l of buildNetworkLinks(mode.id)) links.add(l.id);
      return { active: true, nodes, links };
    }
  }
}
