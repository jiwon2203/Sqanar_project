// src/screens/Board/ReportScreen.js
import React, { useState, useMemo } from 'react';
import { 
  View, Text, StyleSheet, TextInput, 
  TouchableOpacity, ActivityIndicator, Alert, KeyboardAvoidingView, Platform 
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/MaterialIcons';
import apiClient from '../../../api/apiClient';
import { useSettings } from '../../state/useSettings';
import CustomText from '../../../CustomText';

export default function ReportScreen({ navigation }) {
  const { palette, baseFont } = useSettings();
  const [url, setUrl] = useState('');
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);

  const dyn = useMemo(() => ({
    bg: { backgroundColor: palette.bg },
    text: { color: palette.text, fontSize: baseFont },
    sub: { color: palette.sub, fontSize: Math.max(12, baseFont - 2) },
    input: { 
        color: palette.text, 
        borderColor: palette.border, 
        backgroundColor: palette.card,
        fontSize: baseFont,
    },
    button: { backgroundColor: '#3b82f6' },
    buttonText: { color: '#ffffff' }, 
  }), [palette, baseFont]); 

  const handleReport = async () => {
    if (url.trim().length === 0) {
      Alert.alert('오류', '신고할 URL을 입력해 주세요.');
      return;
    }

    setLoading(true);
    try {
      const res = await apiClient.post('/board/report', {
        url,
        reason: reason.trim() || 'No reason provided',
      });
      
      Alert.alert('신고 완료', 'URL 신고가 접수되었습니다. 관리자 확인 후 반영됩니다.');
      navigation.goBack();

    } catch (e) {
      console.error(e);
      Alert.alert('신고 실패', 'URL 신고 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={[styles.safe, dyn.bg]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.keyboardContainer}
      >
        <View style={[styles.header, { borderColor: palette.border }]}>
          <TouchableOpacity onPress={() => navigation.goBack()}>
            <Icon name="close" size={28} color={dyn.text.color} />
          </TouchableOpacity>
          <CustomText style={[styles.title, dyn.text]}>URL 신고하기</CustomText>
          <View style={{ width: 28 }} /> 
        </View>

        <View style={styles.content}>
          <CustomText style={[styles.label, dyn.sub]}>의심되는 URL을 입력해 주세요.</CustomText>
          <TextInput
            style={[styles.input, dyn.input]}
            placeholder="예: http://phishing-site.com/login"
            placeholderTextColor={palette.sub}
            value={url}
            onChangeText={setUrl}
            autoCapitalize="none"
            keyboardType="url"
            returnKeyType="next"
          />

          <CustomText style={[styles.label, dyn.sub, { marginTop: 20 }]}>신고 사유 (선택 사항)</CustomText>
          <TextInput
            style={[styles.input, styles.reasonInput, dyn.input]}
            placeholder="피싱, 악성코드 유포 등 신고 사유를 간략히 적어주세요. (최대 200자)"
            placeholderTextColor={palette.sub}
            value={reason}
            onChangeText={setReason}
            multiline
            numberOfLines={4}
            returnKeyType="done"
          />
          
          <CustomText style={[styles.note, dyn.sub]}>
            신고된 URL은 관리자 검토를 거쳐 악성 URL 목록에 반영됩니다.
          </CustomText>
        </View>
        
        <TouchableOpacity
          style={[styles.reportBtn, dyn.button, loading && styles.disabledBtn]}
          onPress={handleReport}
          disabled={loading || url.trim().length === 0}
          activeOpacity={0.8}
        >
          {loading ? (
            <ActivityIndicator color="#ffffff" />
          ) : (
            <CustomText style={[styles.reportBtnText, dyn.buttonText, { fontSize: baseFont }]}>URL 신고하기</CustomText>
          )}
        </TouchableOpacity>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  keyboardContainer: { flex: 1, justifyContent: 'space-between' },
  center: { justifyContent: 'center', alignItems: 'center' },
  errorText: { textAlign: 'center', fontWeight: 'bold' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  title: { fontSize: 18, fontWeight: '700' },
  content: { flex: 1, padding: 16, },
  label: { fontWeight: '600', marginBottom: 8 },
  input: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: Platform.OS === 'ios' ? 12 : 10,
  },
  reasonInput: { height: 100, textAlignVertical: 'top', paddingVertical: 12, },
  note: { marginTop: 15 },
  reportBtn: {
    margin: 16,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reportBtnText: { fontWeight: '700' },
  disabledBtn: { opacity: 0.6, },
});