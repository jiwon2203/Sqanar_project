// ResetPW.js
import React, { useEffect, useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity,
  KeyboardAvoidingView, Platform, ScrollView, ActivityIndicator, Alert
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialIcons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import apiClient from '../../../api/apiClient';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const ResetPw = ({ navigation }) => {
  const [email, setEmail] = useState('');
  const [nickname, setNickname] = useState('');
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [reseting, setReseting] = useState(false);
  const [error, setError] = useState('');
  const [isSameAsOld, setIsSameAsOld] = useState(false);
  const [isCheckingSamePassword, setIsCheckingSamePassword] = useState(false);

  // 로그인된 사용자 정보 자동 채우기 (있으면)
  // useEffect(() => {
  //   (async () => {
  //     try {
  //       const storedEmail = await AsyncStorage.getItem('user_email');
  //       const storedNickname = await AsyncStorage.getItem('user_nickname');
  //       if (storedEmail) setEmail(storedEmail);
  //       if (storedNickname) setNickname(storedNickname);
  //     } catch {}
  //   })();
  // }, []);

  const pwMismatch = pw.length > 0 && pw2.length > 0 && pw !== pw2;
  const canReset = useMemo(() => {
    return EMAIL_REGEX.test(email.trim()) &&
      nickname.trim().length > 0 &&
      pw.trim().length >= 8 && 
      !pwMismatch && !isCheckingSamePassword;
  }, [email, nickname, pw, pwMismatch, isSameAsOld, isCheckingSamePassword]);

  useEffect(() => {
    const isReadyForCheck = EMAIL_REGEX.test(email.trim()) && nickname.trim().length > 0 && pw.length >= 8;
    
    if (!isReadyForCheck) {
      setIsCheckingSamePassword(false); 
      setIsSameAsOld(false);
      return;
    }

    setIsCheckingSamePassword(true);

    const handler = setTimeout(async () => {
    try {
      const res = await apiClient.post('/auth/check-password-same', {
        email: email.trim(),
        nickname: nickname.trim(),
        password: pw
      });
      setIsSameAsOld(res.data.success && res.data.is_same);
    } catch {
      setIsSameAsOld(false);
    } finally {
      setIsCheckingSamePassword(false);
    }
  }, 500);

  return () => clearTimeout(handler);
}, [pw, email, nickname]);

  //   const checkPassword = async () => {
  //     if (pw.length < 8) return;

  //     setIsCheckingSamePassword(true);

  //     // try {
  //     //     // 서버의 check_password_same API 호출
  //     //     const res = await apiClient.post('/auth/check-password-same', { email: email.trim(), nickname: nickname.trim(), password: pw });
  //     //     if (res?.data?.success) {
  //     //       setIsSameAsOld(res.data.is_same); // API 응답으로 상태 업데이트
  //     //     } else {
  //     //       console.error('비밀번호 일치 여부 확인 실패');
  //     //       setIsSameAsOld(false);
  //     //     }
  //     //   } catch (e) {
  //     //     console.error('네트워크 오류로 비밀번호 일치 여부 확인 실패', e);
  //     //     setIsSameAsOld(false);
  //     //   } finally {
  //     //   setIsCheckingSamePassword(false); // API 호출 완료 후 로딩 종료
  //     // }
  //     const debounce = setTimeout(async () => {
  //       try {
  //         const res = await apiClient.post('/auth/check-password-same', {
  //           email: email.trim(),
  //           nickname: nickname.trim(),
  //           password: pw
  //         });

  //         if (res.data.success) {
  //           setIsSameAsOld(res.data.is_same);
  //         } else {
  //           setIsSameAsOld(false);
  //         }
  //       } catch {
  //         setIsSameAsOld(false);
  //       } finally {
  //         setIsCheckingSamePassword(false);
  //       }
  //     }, 500);
  //       };

  //   // const debounce = setTimeout(() => {
  //   //   checkPassword();
  //   // }, 500); // 0.5초 지연 후 실행하여 불필요한 API 호출을 줄입니다.

  //   // return () => {
  //   //   clearTimeout(debounce);
  //   //   setIsCheckingSamePassword(false); } // 클린업 함수: 타이머 취소
  //   return () => clearTimeout(debounce);
  // }, [pw, email, nickname]); // email과 nickname이 변경될 때도 중복 검사를 다시 실행합니다.

  const resetPassword = async () => {
    if (!canReset || reseting) return;

    try {
      setError('');
      setReseting(true);

      const res = await apiClient.post(
        '/auth/reset-password',
        { email: email.trim(), nickname: nickname.trim(), password: pw },
        { headers: { 'Content-Type': 'application/json' }, validateStatus: () => true }
      );

      if (res?.data?.success) {
        Alert.alert('완료', '비밀번호가 재설정되었습니다.', [
          { text: '확인', onPress: () => navigation.goBack() }
        ]);
      } else {
        setError(res.data.error || '비밀번호 재설정에 실패했습니다.');
      }
    } catch {
      setError('네트워크 오류가 발생했습니다.');
    } finally {
      setReseting(false);
    }
  };

  return (
    <KeyboardAvoidingView style={{flex:1}} behavior={Platform.select({ ios:'padding', android:'height' })}>
      <ScrollView contentContainerStyle={s.container} keyboardShouldPersistTaps="handled">
        <View style={s.header}>
          <TouchableOpacity style={s.backButton} onPress={() => navigation.goBack()}>
            <Icon name="arrow-back" size={28} />
          </TouchableOpacity>
          <CustomText style={s.title}>비밀번호 재설정</CustomText>
        </View>

        <View style={s.form}>
          <CustomText style={s.label}>이메일</CustomText>
          <TextInput
            style={s.input}
            value={email}
            placeholder='you@example.com'
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
          />
          {email !== '' && !EMAIL_REGEX.test(email) && (
            <CustomText style={s.errorText}>올바른 이메일 형식을 입력하세요</CustomText>
          )}

          <CustomText style={s.label}>닉네임</CustomText>
          <TextInput
            style={s.input}
            value={nickname}
            placeholder='닉네임'
            onChangeText={setNickname}
          />

          <CustomText style={s.label}>새 비밀번호 (8자 이상)</CustomText>
          <TextInput
            style={s.input}
            value={pw}
            onChangeText={setPw}
            secureTextEntry
          />

          <CustomText style={s.label}>비밀번호 확인</CustomText>
          <TextInput
            style={s.input}
            value={pw2}
            onChangeText={setPw2}
            secureTextEntry
          />

          {pwMismatch ? <CustomText style={s.errorText}>비밀번호가 일치하지 않습니다</CustomText> : null}
          {isCheckingSamePassword && pw.length >= 8 && <CustomText style={{...s.errorText, color: '#007AFF'}}>비밀번호 중복 확인 중...</CustomText>} 
          {isSameAsOld && (
            <CustomText style={s.errorText}>기존 비밀번호와 동일합니다. 다른 비밀번호를 사용해주세요.</CustomText>
          )}

          <TouchableOpacity
            style={[s.submitBtn, { backgroundColor: canReset ? '#687FE5' : '#D9D9D9' }]}
            disabled={!canReset || reseting}
            onPress={resetPassword}
          >
            {reseting || (isCheckingSamePassword && pw.length >= 8) ? <ActivityIndicator color="#fff" /> :
              <CustomText style={s.submitText}>비밀번호 재설정</CustomText>}
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

const s = StyleSheet.create({
  container:{ flexGrow:1, paddingHorizontal:20, paddingTop:60, backgroundColor:'#fff' },
  header:{ alignItems:'center', justifyContent:'center', marginBottom:20 },
  backButton:{ position:'absolute', left:0 },
  title:{ fontSize:26, fontWeight:'bold' },
  form:{ marginTop:10 },
  label:{ marginTop:14, marginBottom:6, fontSize:14, color:'#333' },
  input:{ height:50, borderColor:'#D9D9D9', borderWidth:1, borderRadius:8, paddingHorizontal:12, backgroundColor:'#fff' },
  submitBtn:{ height:52, borderRadius:10, justifyContent:'center', alignItems:'center', marginTop:22 },
  submitText:{ color:'#fff', fontSize:16, fontWeight:'700' },
  errorText:{ marginTop:6, color:'#FF3B30', fontSize:12 },
});

export default ResetPw;
