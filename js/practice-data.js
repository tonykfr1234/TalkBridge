// Built-in practice phrases. English, Vietnamese and Thai are written by hand;
// other languages are translated from the Chinese line on first use.
// Thai lines use the male polite particle ครับ and ผม; thaiFor() converts them
// to the female forms (ค่ะ / คะ for questions, ดิฉัน).

export const SCENARIOS = [
  { id: 'intro', name: '自我介紹與寒暄', desc: '初次見面、交換名片、請對方重說' },
  { id: 'meeting', name: '商務會議', desc: '開場、議程、表達同意與追蹤' },
  { id: 'negotiation', name: '談判與報價', desc: '殺價、單價、交期、付款條件' },
  { id: 'call', name: '電話與視訊會議', desc: '收訊不良、分享螢幕、約時間' },
  { id: 'factory', name: '工廠與採購', desc: '品質、產量、安全、加班' },
  { id: 'dining', name: '商務餐敘', desc: '請客、點菜、乾杯、買單' },
  { id: 'travel', name: '交通與飯店', desc: '計程車、機場、入住、問路' },
  { id: 'shopping', name: '購物與殺價', desc: '問價、議價、付款、收據' },
];

// [scenario, zh, en, vi, th, thai romanization, isQuestion]
const ROWS = [
  ['intro', '你好，很高興認識你。', 'Hello, nice to meet you.', 'Xin chào, rất vui được gặp anh.', 'สวัสดีครับ ยินดีที่ได้รู้จักครับ', 'sà-wàt-dii khráp, yin-dii thîi dâai rúu-jàk khráp'],
  ['intro', '我叫王大明，來自台灣。', "My name is Daming Wang. I'm from Taiwan.", 'Tôi tên là Vương Đại Minh, tôi đến từ Đài Loan.', 'ผมชื่อหวังต้าหมิง มาจากไต้หวันครับ', 'phǒm chʉ̂ʉ Wǎng Dâa-mǐng, maa jàak Dtâi-wǎn khráp'],
  ['intro', '這是我的名片。', 'Here is my business card.', 'Đây là danh thiếp của tôi.', 'นี่คือนามบัตรของผมครับ', 'nîi khʉʉ naam-bàt khɔ̌ɔng phǒm khráp'],
  ['intro', '您在這家公司工作多久了？', 'How long have you been working at this company?', 'Anh làm việc ở công ty này bao lâu rồi?', 'คุณทำงานที่บริษัทนี้มานานแค่ไหนแล้วครับ', 'khun tham-ngaan thîi bɔɔ-rí-sàt níi maa naan khɛ̂ɛ-nǎi lɛ́ɛo khráp', true],
  ['intro', '謝謝你的幫忙。', 'Thank you for your help.', 'Cảm ơn anh đã giúp đỡ.', 'ขอบคุณสำหรับความช่วยเหลือครับ', 'khɔ̀ɔp-khun sǎm-ràp khwaam chûai-lʉ̌a khráp'],
  ['intro', '不好意思，請再說一次。', 'Sorry, could you say that again?', 'Xin lỗi, anh có thể nói lại được không?', 'ขอโทษครับ ช่วยพูดอีกครั้งได้ไหมครับ', 'khɔ̌ɔ-thôot khráp, chûai phûut ìik khráng dâai mǎi khráp', true],

  ['meeting', '我們開始開會吧。', "Let's get the meeting started.", 'Chúng ta bắt đầu cuộc họp nhé.', 'เรามาเริ่มประชุมกันเลยครับ', 'rao maa rə̂əm prà-chum gan ləəi khráp'],
  ['meeting', '今天的議程有三個項目。', "We have three items on today's agenda.", 'Chương trình họp hôm nay có ba nội dung.', 'วาระการประชุมวันนี้มีสามหัวข้อครับ', 'waa-rá gaan prà-chum wan-níi mii sǎam hǔa-khɔ̂ɔ khráp'],
  ['meeting', '你對這個方案有什麼看法？', 'What do you think about this proposal?', 'Anh nghĩ sao về phương án này?', 'คุณคิดอย่างไรกับข้อเสนอนี้ครับ', 'khun khít yàang-rai gàp khɔ̂ɔ-sà-nəə níi khráp', true],
  ['meeting', '我同意，但預算需要再確認。', 'I agree, but we need to confirm the budget.', 'Tôi đồng ý, nhưng cần xác nhận lại ngân sách.', 'ผมเห็นด้วย แต่ต้องยืนยันงบประมาณอีกครั้งครับ', 'phǒm hěn-dûai, dtɛ̀ɛ dtɔ̂ng yʉʉn-yan ngóp-prà-maan ìik khráng khráp'],
  ['meeting', '請在週五前把報告寄給我。', 'Please send me the report by Friday.', 'Vui lòng gửi báo cáo cho tôi trước thứ Sáu.', 'กรุณาส่งรายงานให้ผมภายในวันศุกร์ครับ', 'gà-rú-naa sòng raai-ngaan hâi phǒm phaai-nai wan sùk khráp'],
  ['meeting', '我們下次會議再討論。', "Let's discuss it at the next meeting.", 'Chúng ta sẽ thảo luận tiếp trong cuộc họp sau.', 'เราค่อยคุยกันในการประชุมครั้งหน้าครับ', 'rao khɔ̂i khui gan nai gaan prà-chum khráng nâa khráp'],

  ['negotiation', '這個價格可以再便宜一點嗎？', 'Could you lower the price a little?', 'Giá này có thể giảm thêm một chút không?', 'ราคานี้ลดได้อีกนิดไหมครับ', 'raa-khaa níi lót dâai ìik nít mǎi khráp', true],
  ['negotiation', '如果訂一千個，單價是多少？', 'What is the unit price if we order one thousand pieces?', 'Nếu đặt một nghìn cái thì đơn giá là bao nhiêu?', 'ถ้าสั่งหนึ่งพันชิ้น ราคาต่อชิ้นเท่าไหร่ครับ', 'thâa sàng nʉ̀ng phan chín, raa-khaa dtɔ̀ɔ chín thâo-rài khráp', true],
  ['negotiation', '交期大概要多久？', 'What is the lead time?', 'Thời gian giao hàng khoảng bao lâu?', 'ใช้เวลาส่งของประมาณกี่วันครับ', 'chái wee-laa sòng khɔ̌ɔng prà-maan gìi wan khráp', true],
  ['negotiation', '付款條件是三十天。', 'Payment terms are net thirty days.', 'Điều kiện thanh toán là ba mươi ngày.', 'เงื่อนไขการชำระเงินคือสามสิบวันครับ', 'ngʉ̂an-khǎi gaan cham-rá ngən khʉʉ sǎam-sìp wan khráp'],
  ['negotiation', '這是我們最好的報價。', 'This is our best offer.', 'Đây là mức giá tốt nhất của chúng tôi.', 'นี่เป็นราคาที่ดีที่สุดของเราแล้วครับ', 'nîi bpen raa-khaa thîi dii thîi-sùt khɔ̌ɔng rao lɛ́ɛo khráp'],
  ['negotiation', '我需要跟主管討論一下。', 'I need to discuss this with my manager.', 'Tôi cần trao đổi với quản lý của tôi.', 'ผมต้องปรึกษาหัวหน้าก่อนครับ', 'phǒm dtɔ̂ng bprʉ̀k-sǎa hǔa-nâa gɔ̀ɔn khráp'],

  ['call', '你好，我是台灣總公司的 Tony。', 'Hello, this is Tony from the Taiwan head office.', 'Xin chào, tôi là Tony từ trụ sở chính ở Đài Loan.', 'สวัสดีครับ ผมโทนี่จากสำนักงานใหญ่ที่ไต้หวันครับ', 'sà-wàt-dii khráp, phǒm Thoo-nîi jàak sǎm-nák-ngaan yài thîi Dtâi-wǎn khráp'],
  ['call', '你聽得到我嗎？', 'Can you hear me?', 'Anh có nghe rõ tôi không?', 'ได้ยินผมไหมครับ', 'dâai-yin phǒm mǎi khráp', true],
  ['call', '你的聲音斷斷續續的。', "You're breaking up.", 'Tiếng của anh bị ngắt quãng.', 'เสียงของคุณขาด ๆ หาย ๆ ครับ', 'sǐang khɔ̌ɔng khun khàat-khàat hǎai-hǎai khráp'],
  ['call', '我分享一下螢幕。', 'Let me share my screen.', 'Để tôi chia sẻ màn hình.', 'ขอแชร์หน้าจอนะครับ', 'khɔ̌ɔ chɛɛ nâa-jɔɔ ná khráp'],
  ['call', '可以約下週二下午開會嗎？', 'Can we schedule a meeting for next Tuesday afternoon?', 'Chúng ta có thể hẹn họp vào chiều thứ Ba tuần sau không?', 'นัดประชุมบ่ายวันอังคารหน้าได้ไหมครับ', 'nát prà-chum bàai wan ang-khaan nâa dâai mǎi khráp', true],
  ['call', '我會寄會議記錄給大家。', "I'll send the meeting minutes to everyone.", 'Tôi sẽ gửi biên bản cuộc họp cho mọi người.', 'ผมจะส่งบันทึกการประชุมให้ทุกคนครับ', 'phǒm jà sòng ban-thʉ́k gaan prà-chum hâi thúk khon khráp'],

  ['factory', '這批貨的品質有問題。', 'There is a quality problem with this batch.', 'Lô hàng này có vấn đề về chất lượng.', 'สินค้าล็อตนี้มีปัญหาเรื่องคุณภาพครับ', 'sǐn-kháa lɔ́t níi mii bpan-hǎa rʉ̂ang khun-na-phâap khráp'],
  ['factory', '請檢查一下機器。', 'Please check the machine.', 'Vui lòng kiểm tra máy.', 'ช่วยตรวจเครื่องจักรหน่อยครับ', 'chûai dtrùat khrʉ̂ang-jàk nɔ̀i khráp'],
  ['factory', '今天的產量是多少？', "What is today's output?", 'Sản lượng hôm nay là bao nhiêu?', 'วันนี้ผลิตได้เท่าไหร่ครับ', 'wan-níi phà-lìt dâai thâo-rài khráp', true],
  ['factory', '安全第一，請戴好安全帽。', 'Safety first. Please wear your helmet.', 'An toàn là trên hết, vui lòng đội mũ bảo hộ.', 'ความปลอดภัยต้องมาก่อน กรุณาสวมหมวกนิรภัยครับ', 'khwaam bplɔ̀ɔt-phai dtɔ̂ng maa gɔ̀ɔn, gà-rú-naa sǔam mùak ní-rá-phai khráp'],
  ['factory', '明天要加班。', 'We need to work overtime tomorrow.', 'Ngày mai phải tăng ca.', 'พรุ่งนี้ต้องทำงานล่วงเวลาครับ', 'phrûng-níi dtɔ̂ng tham-ngaan lûang-wee-laa khráp'],
  ['factory', '原料什麼時候到？', 'When will the raw materials arrive?', 'Khi nào nguyên liệu về?', 'วัตถุดิบจะมาถึงเมื่อไหร่ครับ', 'wát-thù-dìp jà maa thʉ̌ng mʉ̂a-rài khráp', true],

  ['dining', '今天我請客。', "It's my treat today.", 'Hôm nay tôi mời.', 'มื้อนี้ผมเลี้ยงเองครับ', 'mʉ́ʉ níi phǒm líang eeng khráp'],
  ['dining', '有什麼推薦的菜嗎？', 'What do you recommend?', 'Anh có gợi ý món nào không?', 'มีเมนูแนะนำไหมครับ', 'mii mee-nuu nɛ́-nam mǎi khráp', true],
  ['dining', '我不吃辣。', "I don't eat spicy food.", 'Tôi không ăn cay.', 'ผมกินเผ็ดไม่ได้ครับ', 'phǒm gin phèt mâi dâai khráp'],
  ['dining', '乾杯！', 'Cheers!', 'Một, hai, ba, dô!', 'ชนแก้ว!', 'chon gɛ̂ɛo!'],
  ['dining', '祝我們合作愉快！', "Here's to a successful partnership!", 'Chúc hợp tác thành công!', 'ขอให้ความร่วมมือของเราประสบความสำเร็จครับ', 'khɔ̌ɔ hâi khwaam rûam-mʉʉ khɔ̌ɔng rao prà-sòp khwaam sǎm-rèt khráp'],
  ['dining', '買單，謝謝。', 'Could we have the bill, please?', 'Cho tôi tính tiền nhé.', 'เช็คบิลด้วยครับ', 'chék bin dûai khráp'],

  ['travel', '請帶我去這個地址。', 'Please take me to this address.', 'Cho tôi đến địa chỉ này.', 'ช่วยไปส่งที่ที่อยู่นี้หน่อยครับ', 'chûai bpai sòng thîi thîi-yùu níi nɔ̀i khráp'],
  ['travel', '到機場要多久？', 'How long does it take to get to the airport?', 'Đi đến sân bay mất bao lâu?', 'ไปสนามบินใช้เวลานานเท่าไหร่ครับ', 'bpai sà-nǎam-bin chái wee-laa naan thâo-rài khráp', true],
  ['travel', '我有訂房，名字是王大明。', 'I have a reservation under Daming Wang.', 'Tôi đã đặt phòng, tên là Vương Đại Minh.', 'ผมจองห้องไว้ ชื่อหวังต้าหมิงครับ', 'phǒm jɔɔng hɔ̂ng wái, chʉ̂ʉ Wǎng Dâa-mǐng khráp'],
  ['travel', '早餐幾點開始？', 'What time does breakfast start?', 'Bữa sáng bắt đầu lúc mấy giờ?', 'อาหารเช้าเริ่มกี่โมงครับ', 'aa-hǎan cháao rə̂əm gìi moong khráp', true],
  ['travel', '洗手間在哪裡？', 'Where is the restroom?', 'Nhà vệ sinh ở đâu?', 'ห้องน้ำอยู่ที่ไหนครับ', 'hɔ̂ng-náam yùu thîi-nǎi khráp', true],
  ['travel', '請幫我叫計程車。', 'Could you call a taxi for me?', 'Gọi giúp tôi một chiếc taxi nhé.', 'ช่วยเรียกแท็กซี่ให้หน่อยครับ', 'chûai rîak thɛ́k-sîi hâi nɔ̀i khráp'],

  ['shopping', '這個多少錢？', 'How much is this?', 'Cái này bao nhiêu tiền?', 'อันนี้เท่าไหร่ครับ', 'an níi thâo-rài khráp', true],
  ['shopping', '太貴了，可以便宜一點嗎？', "That's too expensive. Can you give me a discount?", 'Đắt quá, bớt cho tôi một chút được không?', 'แพงไป ลดหน่อยได้ไหมครับ', 'phɛɛng bpai, lót nɔ̀i dâai mǎi khráp', true],
  ['shopping', '可以刷卡嗎？', 'Can I pay by card?', 'Có thanh toán bằng thẻ được không?', 'จ่ายด้วยบัตรได้ไหมครับ', 'jàai dûai bàt dâai mǎi khráp', true],
  ['shopping', '有其他顏色嗎？', 'Do you have it in other colors?', 'Có màu khác không?', 'มีสีอื่นไหมครับ', 'mii sǐi ʉ̀ʉn mǎi khráp', true],
  ['shopping', '我只是看看。', "I'm just looking.", 'Tôi chỉ xem thôi.', 'ขอดูก่อนครับ', 'khɔ̌ɔ duu gɔ̀ɔn khráp'],
  ['shopping', '請給我收據。', 'Could I have a receipt, please?', 'Cho tôi xin hóa đơn.', 'ขอใบเสร็จด้วยครับ', 'khɔ̌ɔ bai-sèt dûai khráp'],
];

export const PHRASES = ROWS.map(([scenario, zh, en, vi, th, thr, q], i) => ({
  id: `${scenario}-${i}`, scenario, zh, en, vi, th, thr, q: !!q,
}));

// Female polite forms for Thai.
export function thaiFor(phrase, female) {
  if (!female) return { text: phrase.th, roman: phrase.thr };
  const end = phrase.q ? 'คะ' : 'ค่ะ';
  const endR = phrase.q ? 'khá' : 'khâ';
  return {
    text: phrase.th.replace(/ผม/g, 'ดิฉัน').replace(/ครับ/g, end),
    roman: phrase.thr.replace(/phǒm/g, 'dì-chǎn').replace(/khráp/g, endR),
  };
}

export const PRACTICE_LANGS = ['en', 'vi', 'th', 'ja', 'ko', 'id'];

// Study guides shown on the 學習方法 tab.
export const GUIDES = {
  en: {
    title: '英文：先把「聽得懂」和「說得順」練起來',
    points: [
      '跟讀（shadowing）：播放句子後 0.5 秒內跟著念，模仿重音與語調，而不只是單字。',
      '連音最常卡住台灣人：Let me → "lemme"、want to → "wanna"、Could you → "couldja"。用慢速播放先聽清楚。',
      '商務場合多用 Could you…? / Would it be possible to…? 讓語氣更客氣。',
      '每天挑一個情境，念到評分 90 分以上再換下一句；隔天先複習昨天的句子。',
    ],
  },
  vi: {
    title: '越南文：聲調決定意思，先練六個聲調',
    points: [
      '六個聲調：ngang（平，ma 鬼）、huyền（降，mà 但是）、sắc（升，má 媽）、hỏi（問，mả 墳）、ngã（跌，mã 馬）、nặng（重，mạ 秧苗）。',
      '稱呼看對象：對年長或地位較高的男性用 anh／ông，女性用 chị／bà；自稱 tôi 最安全。',
      '句尾加 ạ 表示禮貌（Cảm ơn anh ạ），對主管、客戶很好用。',
      '北部（河內）與南部（胡志明市）發音不同，系統語音以北部為主，到南部工作可多聽當地同事說。',
    ],
  },
  th: {
    title: '泰文：記得句尾禮貌語，再練五個聲調',
    points: [
      '男生句尾加 ครับ（khráp），女生直述句加 ค่ะ（khâ）、問句加 คะ（khá）。上方可切換男／女聲口吻。',
      '五個聲調：中平、低、降、高、升。拼音上的符號 à（低）、â（降）、á（高）、ǎ（升），沒符號就是中平。',
      '送氣與不送氣要分清：ป bp（不送氣）、พ ph（送氣）；ต dt、ท th。',
      '泰國職場重視和氣，拒絕時常用 ไม่เป็นไร（mâi bpen rai，沒關係）緩和語氣。',
    ],
  },
  ja: {
    title: '日文：敬語是商務的關鍵',
    points: [
      '先學 です／ます 體，對客戶用尊敬語（いらっしゃる、おっしゃる），講自己用謙讓語（参る、申す）。',
      '注意長音與促音：おばさん／おばあさん、きて／きって 意思不同。',
      '日文句子由內建翻譯產生，建議搭配「AI 情境對話」請 Claude 修正用語。',
    ],
  },
  ko: {
    title: '韓文：先熟悉發音規則與敬語',
    points: [
      '商務場合用 합니다 體（格式體）或 해요 體（禮貌體）。',
      '收音（받침）後接母音會連音：한국어 讀作 [한구거]。',
      '韓文句子由內建翻譯產生，建議搭配「AI 情境對話」請 Claude 修正用語。',
    ],
  },
  id: {
    title: '印尼文：發音規則簡單，先把詞彙量撐起來',
    points: [
      '照字母念即可，c 讀作「ch」，r 要打舌。',
      '對客戶稱 Bapak（先生）／Ibu（女士），可縮寫為 Pak／Bu。',
      '印尼文句子由內建翻譯產生，建議搭配「AI 情境對話」請 Claude 修正用語。',
    ],
  },
};
