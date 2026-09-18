import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useSettings } from '../../state/useSettings';
import CustomText from '../../../CustomText';

// --- 핵심 로직: 텍스트 분리 함수 ---=
const splitMessage = (text) => {
  if (!text || typeof text !== 'string') return { summaryOnly: '', hasDetails: false };

  // 1) 단순 존재 체크(빠른 실패/성공 판단용)
  if (!/상세\s*설명/i.test(text)) {
    // '상세 설명' 단어 자체가 없으면 상세 없음
    return { summaryOnly: text.trim(), hasDetails: false };
  }

  // 2) 가장 보편적으로 '상세 설명' 헤딩 앞까지 전부 캡처하는 정규식
  // ([\s\S]*?) : 가능한 최소(비탐욕)으로 헤딩 전까지 모든 문자 캡처
  // 헤딩 패턴은 괄호나 콜론, 영문(Details) 표기 등 다양한 경우 허용
  const regex = /([\s\S]*?)(?:\r?\n\s*)?\b상세\s*설명\b(?:\s*\([^\)]*\))?\s*[:：-]*\s*(?:\r?\n|$)/i;
  const m = text.match(regex);

  if (m && typeof m[1] === 'string') {
    const summary = m[1].trim();

    if (summary.length < 6) {
      return { summaryOnly: text.trim(), hasDetails: false };
    }

    return { summaryOnly: summary, hasDetails: true };
  }

  // 3) 만약 위 정규식이 못잡으면(특수문자 때문일 가능성)
  // 보수적으로 '상세 설명' 단순 키워드 위치로 잘라보기
  const idx = text.toLowerCase().indexOf('상세 설명');
  if (idx > 0) {
    const summary = text.slice(0, idx).trim();
    if (summary.length >= 6) return { summaryOnly: summary, hasDetails: true };
  }

  // 4) 마지막 페일백: 텍스트가 길면 앞부분만 요약
  const MAX_SUMMARY_CHARS = 600;
  if (text.length > MAX_SUMMARY_CHARS) {
    return { summaryOnly: text.slice(0, MAX_SUMMARY_CHARS).trim() + '…', hasDetails: true };
  }

  return { summaryOnly: text.trim(), hasDetails: false };
};



export default function MessageBubble({ role, text, meta }) {
  const isUser = role === 'user';
  const { palette, baseFont } = useSettings();
  const [showDetails, setShowDetails] = useState(false); 
  const { summaryOnly, hasDetails } = isUser 
    ? { summaryOnly: text, hasDetails: false } 
    : splitMessage(text);

  // 표시할 최종 텍스트 결정
  const contentToDisplay = hasDetails && !showDetails && !isUser
    ? summaryOnly
    : text;
  
  // 버튼 텍스트와 동작을 결정
  const buttonText = showDetails ? '닫기 ▲' : '상세 정보 더보기 ▼';
  const toggleDetails = () => setShowDetails(prev => !prev);

  return (
    <View style={[styles.row, isUser ? styles.right : styles.left]}>
      <View style={[
        styles.bubble,
        isUser
          ? { backgroundColor: palette.primary }
          : { backgroundColor: palette.card, borderWidth: 1, borderColor: palette.border }
      ]}>
        {isUser ? (
          <CustomText style={[styles.msg, { color: '#fff', fontSize: baseFont }]}>{text}</CustomText>
          ) : (
          // 전체 텍스트(text) 대신, 결정된 텍스트(contentToDisplay)를 전달합니다.
          <View style={styles.botTextWrap}>{renderFormattedText(contentToDisplay, { palette, baseFont })}</View>
          )}
        
        {/* 더보기/닫기 버튼 영역 */}
        {hasDetails && !isUser && ( 
            <TouchableOpacity 
                onPress={toggleDetails} 
                style={[
                    styles.moreButton, 
                    { borderTopColor: palette.border }
                ]}
            >
                <CustomText style={[styles.moreButtonText, { color: palette.primary }]}>
                    {buttonText}
                </CustomText>
            </TouchableOpacity>
        )}

        {/* 챗봇 모드 표시 부분은 그대로 유지됩니다. */}
        {!!meta?.mode && !isUser && (
          <CustomText style={[styles.meta, { color: palette.sub, fontSize: Math.max(11, baseFont - 2) }]}>mode: {meta.mode}</CustomText>
         )}
      </View>
    </View>
  );
}
function renderFormattedText(text, { palette, baseFont }) {
  const lines = String(text || '').split('\n');
  return lines.map((raw, i) => {
    let line = raw;
    
    // '**'로만 시작하는 경우(e.g., **제목**)는 글머리표 변환을 건너뜁니다.
    const isBulletPoint = raw.trim().startsWith('*') && !raw.trim().startsWith('**');

    if (isBulletPoint) {
      // 첫 번째 '*'를 '• '로 대체하고 나머지 텍스트는 그대로 유지합니다.
      line = '• ' + raw.trim().slice(1).trim();
    } else {
      // 순수한 '**볼드**' 라인이나 일반 텍스트는 원본을 유지합니다.
      line = raw;
    }

    // **bold** 를 분리하여 각각 Text로 감싸기
    const parts = line.split(/(\*\*[^*]+\*\*)/g);
    return (
      <CustomText
        key={`ln-${i}`}
        style={{ color: palette.text, fontSize: baseFont, lineHeight: baseFont * 1.4 }}
      >
        {parts.map((p, j) => {
          const m = p.match(/^\*\*([^*]+)\*\*$/);
          if (m) {
            return (
              <CustomText key={`b-${i}-${j}`} style={{ fontWeight: '700', color: palette.text }}>
                {m[1]}
              </CustomText>
            );
          }
          return <CustomText key={`t-${i}-${j}`}>{p}</CustomText>;
        })}
      </CustomText>
);
  });
}
const styles = StyleSheet.create({
  row: { flexDirection: 'row', marginVertical: 6, paddingHorizontal: 4 },
  left: { justifyContent: 'flex-start' },
  right: { justifyContent: 'flex-end' },
  bubble: {
    maxWidth: '88%',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 16,
  },
  bubbleUser: { backgroundColor: '#687FE5' },
  bubbleBot: { backgroundColor: '#E9EDFF' },
  msg: { fontSize: 16, lineHeight: 22 },
  msgUser: { color: 'white' },
  msgBot: { color: '#0F1630' },
  bold: { fontWeight: '700', color: '#0F1630' },
  botTextWrap: { flexDirection: 'column' },
  meta: { marginTop: 6, fontSize: 12, color: '#586083' },
  moreButton: {
    paddingTop: 8,
    marginTop: 8,
    borderTopWidth: 1,
    alignItems: 'center',
  },
  moreButtonText: { fontWeight: 'bold', fontSize: 14, },
});
