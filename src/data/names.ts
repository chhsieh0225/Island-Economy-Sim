import type { Gender } from '../types';
import type { RNG } from '../engine/RNG';

const SURNAMES = [
  '王', '李', '張', '陳', '林', '黃', '劉', '吳', '楊', '蔡',
  '許', '鄭', '謝', '郭', '洪', '邱', '曾', '廖', '賴', '周',
  '徐', '蘇', '葉', '呂', '魏', '高', '潘', '朱', '傅', '彭',
  '江', '何', '施', '沈', '余', '田', '盧', '姚', '方', '石',
];

const GIVEN_NAMES_M = [
  '志豪', '建宏', '俊傑', '建志', '志明', '俊豪', '建國', '志偉', '俊賢', '建文',
  '家豪', '文傑', '志遠', '建中', '志成', '建宇', '俊明', '柏翰', '冠宇', '宗翰',
];

const GIVEN_NAMES_F = [
  '美玲', '淑惠', '秀英', '雅婷', '心怡', '雅琪', '美華', '淑芬', '怡君', '雅玲',
  '佳蓉', '雅雯', '佳穎', '美琴', '淑貞', '美慧', '淑娟', '雅芳', '美麗', '雅萍',
];

export function generateName(gender: Gender, rng: RNG): string {
  const surname = rng.pick(SURNAMES);
  const given = gender === 'M' ? rng.pick(GIVEN_NAMES_M) : rng.pick(GIVEN_NAMES_F);
  return surname + given;
}
