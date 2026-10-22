// Device voice choice by gender.
import test from 'node:test';
import assert from 'node:assert/strict';
import { guessGender, pickVoice } from '../js/tts.js';

const V = (name, lang) => ({ name, lang, voiceURI: name });
const voices = [
  V('Microsoft Hanhan - Chinese (Traditional, Taiwan)', 'zh-TW'),
  V('Microsoft Zhiwei - Chinese (Traditional, Taiwan)', 'zh-TW'),
  V('Microsoft HsiaoChen Online (Natural) - Chinese (Taiwan)', 'zh-TW'),
  V('Microsoft YunJhe Online (Natural) - Chinese (Taiwan)', 'zh-TW'),
  V('Google US English', 'en-US'),
  V('Google UK English Male', 'en-GB'),
  V('Microsoft David - English (United States)', 'en-US'),
  V('Microsoft NamMinh Online (Natural) - Vietnamese (Vietnam)', 'vi-VN'),
  V('Microsoft HoaiMy Online (Natural) - Vietnamese (Vietnam)', 'vi-VN'),
  V('Kanya', 'th-TH'),
];

test('gender from voice names', () => {
  assert.equal(guessGender(voices[0]), 'female');
  assert.equal(guessGender(voices[1]), 'male');
  assert.equal(guessGender(voices[4]), 'female');
  assert.equal(guessGender(voices[5]), 'male');
  assert.equal(guessGender(V('Some Voice', 'en-US')), null);
});

test('pickVoice prefers the gender, then natural voices, then any voice of the language', () => {
  assert.equal(pickVoice(voices, 'zh-TW', 'female').name, voices[2].name);
  assert.equal(pickVoice(voices, 'zh-TW', 'male').name, voices[3].name);
  assert.equal(pickVoice(voices, 'en-US', 'male').name, voices[6].name);
  assert.equal(pickVoice(voices, 'en-GB', 'female').name, 'Google US English');
  assert.equal(pickVoice(voices, 'vi-VN', 'male').name, voices[7].name);
  assert.equal(pickVoice(voices, 'th-TH', 'male').name, 'Kanya');
  assert.equal(pickVoice(voices, 'ko-KR', 'male'), null);
});
