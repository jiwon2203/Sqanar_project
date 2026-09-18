import React, { useState, useMemo } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet } from 'react-native';
import { useSettings } from '../../state/useSettings';
import Icon from 'react-native-vector-icons/MaterialIcons';
import CustomText from '../../../CustomText';

export default function Composer({ 
  placeholder, onSend, onOpenQRHistory, tooltip,
  value: valueProp,
  onChangeText: onChangeTextProp,
}) {
  const [inner, setInner] = useState('');
  const value = valueProp !== undefined ? valueProp : inner;
  const setValue = onChangeTextProp ? onChangeTextProp : setInner;
  const canSend = useMemo(() => value.trim().length > 0, [value]);
  const { palette, baseFont, theme } = useSettings();
  const dyn = {
    wrap:  { backgroundColor: palette.card, borderTopColor: palette.border },
    input: { color: palette.text, fontSize: baseFont, backgroundColor: palette.card },
    ph: { color: palette.sub },
    tipBg: { backgroundColor: theme === 'dark' ? '#E6ECF2' : '#374151' },
    tipText: { color: theme === 'dark' ? '#101214' : '#fff' },
  };
  const send = () => {
    if (!canSend) return;
    onSend?.(value.trim());
    if (onChangeTextProp) onChangeTextProp('');
    else setInner('');
  };

  return (
    <View style={[styles.wrap, dyn.wrap]}>
      <View style={styles.inputWrap}>
        {/* 좌측: QR 기록 열기 버튼 */}
        <View style={styles.attachWrap}>
          <TouchableOpacity
            onPress={onOpenQRHistory}
            style={styles.iconBtn}
            accessibilityRole="button"
          >
            <Icon name="assignment" size={22} color={palette.sub} />
          </TouchableOpacity>

          {!!tooltip && (
            <View style={[styles.tooltip, dyn.tipBg]}>
              <CustomText style={[styles.tooltipText, dyn.tipText, { fontSize: Math.max(10, baseFont - 3) }]}
              >
                {tooltip}
              </CustomText>
            </View>
          )}
        </View>

        {/* 입력창 */}
        <TextInput
          style={[styles.input, dyn.input]}
          value={value}
          onChangeText={setValue}
          placeholder={placeholder || ''}
          placeholderTextColor={dyn.ph.color}
          returnKeyType="send"
          onSubmitEditing={send}
        />

        {/* 전송 버튼 */}
        <TouchableOpacity
          onPress={send}
          disabled={!canSend}
          style={[styles.sendBtn, !canSend && styles.sendBtnDim]}
          accessibilityRole="button"
          accessibilityLabel="메시지 전송"
        >
          <Icon name="send" size={18} color="#fff" />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { padding: 10, borderTopWidth: 1, borderTopColor: '#eee', backgroundColor: '#fff' },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: '#E6ECF2',
    paddingHorizontal: 8,
  },
  attachWrap: { position: 'relative', justifyContent: 'center', alignItems: 'center' },
  iconBtn: { paddingVertical: 10, paddingHorizontal: 8 },
  tooltip: {
    position: 'absolute',
    bottom: 44,
    left: 2,
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 6,
    minWidth: 125,
    maxWidth: 200,
  },
  tooltipText: { color: '#fff' },
  input: { flex: 1, paddingVertical: 10, paddingHorizontal: 8 }, // 💡 fontSize 15 제거
  sendBtn: {
    backgroundColor: '#1b64ff',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 18,
    marginLeft: 4,
    opacity: 1,
  },
  sendBtnDim: { backgroundColor: '#9aa7ff', opacity: 0.7 },
});
