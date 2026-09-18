// UpdateProfile.js
import React, { useState, useMemo, useEffect } from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity,
  KeyboardAvoidingView, Platform, ScrollView, ActivityIndicator, Alert
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialIcons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import apiClient from '../../../api/apiClient';
import { useSettings } from '../../state/useSettings';
import CustomText from '../../../CustomText';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const getGenderInKorean = (genderCode) => {
  switch (genderCode) {
    case 'M': return '남성';
    case 'F': return '여성';
    case 'N': return '비공개';
    default: return '미정';
  }
};

const UpdateProfile = ({ navigation }) => {
  const [email, setEmail] = useState('');
  const [nickname, setNickname] = useState('');
  const [initialNickname, setInitialNickname] = useState('');

  const [birthDate, setBirthDate] = useState('');
  const [gender, setGender] = useState(''); 
  const [userRole, setUserRole] = useState(''); 
  const [isLoading, setIsLoading] = useState(true); // 로딩 상태 추가

  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [reseting, setReseting] = useState(false);
  const [error, setError] = useState('');

  const [isPasswordEditing, setIsPasswordEditing] = useState(false);
  const [isSameAsCurrentPw, setIsSameAsCurrentPw] = useState(false);

  useEffect(() => {
    // AsyncStorage 대신 서버의 신규 API를 호출합니다.
    const fetchUser = async () => {
      setIsLoading(true);
      try {
        const response = await apiClient.get('/auth/profile-details');
        const userData = response.data;

        if (userData.success) {
          const { email, nickname, birth_date, gender, role } = userData;
          
          if (email) setEmail(email);
          if (nickname) {
            setNickname(nickname);
            setInitialNickname(nickname);
          }
          if (birth_date) setBirthDate(birth_date); 
          if (gender) setGender(gender);
          if (role) setUserRole(role);
          
        } else {
          console.error('사용자 정보 로드 실패:', userData.error || '로그인이 필요합니다.');
          Alert.alert('오류', userData.error || '로그인이 필요합니다.');
        }
      } catch (e) {
        console.error('사용자 정보 로드 실패 (API 호출 오류)', e);
        Alert.alert('오류', '사용자 정보를 불러오는데 실패했습니다. 네트워크를 확인해주세요.');
      } finally {
        setIsLoading(false);
      }
    };
    fetchUser();
  }, []);

  // 비밀번호가 기존과 동일한지 확인하는 함수
  const checkSamePassword = async (newPassword) => {
    if (!isPasswordEditing || newPassword.length < 8) {
      setIsSameAsCurrentPw(false);
      return;
    }

    if (pwMismatch) {
      setIsSameAsCurrentPw(false);
      return;
    }

    try {
      const res = await apiClient.post('/auth/check-password-same', 
        { password: newPassword },
        { headers: { 'Content-Type': 'application/json' }, validateStatus: () => true }
      );

      const isSame = res?.data?.is_same === true;
      setIsSameAsCurrentPw(isSame);
    } catch (e) {
      console.error('비밀번호 동일성 확인 실패', e);
      setIsSameAsCurrentPw(false); 
    }
  };

  // pw 상태가 변경될 때마다 동일 여부 체크
   useEffect(() => {
    if (isPasswordEditing) {
      checkSamePassword(pw);
    }
  }, [pw, isPasswordEditing]);

  const pwMismatch = pw.length > 0 && pw2.length > 0 && pw !== pw2;
  const canChangeNickname = nickname.trim().length > 0 && nickname !== initialNickname;
  //const canChangePassword = isPasswordEditing && pw.length >= 8 && !pwMismatch;
  const canChangePassword = isPasswordEditing && pw.length >= 8 && !pwMismatch && !isSameAsCurrentPw;

  const handleSetPw = (text) => {
    setPw(text);
    setIsSameAsCurrentPw(false);
  }

  const updateProfile = async () => {
    if (reseting) return;
    setReseting(true);
    setError('');

    try {
      const res = await apiClient.post(
        '/auth/update-nickname',
        { nickname: nickname.trim() },
        { headers: {'Content-Type': 'application/json'}, validateStatus: () => true }
      );
      
      if (res?.data?.success === true) {
        Alert.alert('완료', '닉네임이 성공적으로 수정되었습니다.', [
          { text: '확인', onPress: () => navigation.goBack() }
        ]);
      } else {
        setError(res?.data?.error || '닉네임 수정에 실패했습니다.');
      }
    } catch (e) {
      setError(e.message || '네트워크 오류가 발생했습니다.');
    } finally {
      setReseting(false);
    }
  };



  const saveProfile = async () => {
  if (reseting) return;
  setReseting(true);
  setError('');

  try {
    // 닉네임 변경
    if (canChangeNickname) {
      const res = await apiClient.post('/auth/update-nickname',
        { nickname: nickname.trim() },
        { headers: { 'Content-Type': 'application/json' }, validateStatus: () => true }
      );
      if (!res?.data?.success) throw new Error(res?.data?.error || '닉네임 수정 실패');
    }

    // 비밀번호 변경
    if (canChangePassword) {
      const res = await apiClient.post('/auth/reset-password',
        { email: email.trim(), nickname: nickname.trim(), password: pw },
        { headers: { 'Content-Type': 'application/json' }, validateStatus: () => true }
      );
      if (!res?.data?.success) throw new Error(res?.data?.error || '비밀번호 수정 실패');
    }

    Alert.alert('완료', '프로필이 성공적으로 수정되었습니다.', [
      { text: '확인', onPress: () => navigation.goBack() }
    ]);

  } catch (e) {
    setError(e.message || '네트워크 오류가 발생했습니다.');
  } finally {
    setReseting(false);
  }
};


  const { palette } = useSettings(); 
  const dyn = {
    bg: { backgroundColor: palette.bg },
    text: { color: palette.text },
    label: { color: palette.sub },
    input: { borderColor: palette.border, backgroundColor: palette.card, color: palette.text },
    primary: { backgroundColor: palette.primary },
    error: { color: '#FF3B30' }, // 에러 텍스트는 빨간색으로 하드코딩 유지
  };

  if (isLoading) {
    return (
      <View style={[styles.loadingContainer, dyn.bg]}>
        <ActivityIndicator size="large" color={palette.primary} />
        <CustomText style={[styles.loadingText, dyn.text]}>프로필 정보를 불러오는 중...</CustomText>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={{flex:1}} behavior={Platform.select({ ios:'padding', android:'height' })}>
      <ScrollView contentContainerStyle={[styles.container, dyn.bg]} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
            <Icon name="arrow-back" size={28} color={dyn.text.color} /> 
          </TouchableOpacity>
          <CustomText style={[styles.title, dyn.text]}>프로필 수정</CustomText> 
        </View><View style={styles.form}>
          <CustomText style={[styles.label, dyn.label]}>이메일</CustomText>
          <TextInput
            style={[styles.input, styles.disabledInput, dyn.input]}
            autoCapitalize="none"
            keyboardType="email-address"
            value={email}
            editable={false}
            selectTextOnFocus={false}
          />

          <CustomText style={[styles.label, dyn.label]}>닉네임</CustomText> 
          <TextInput
            style={[styles.input, dyn.input]}
            value={nickname}
            onChangeText={setNickname}
            placeholder="변경할 닉네임을 입력하세요"
          />

          <CustomText style={[styles.label, dyn.label]}>생년월일</CustomText>
          <TextInput
            style={[styles.input, styles.disabledInput, dyn.input]}
            value={birthDate}
            editable={false} 
            selectTextOnFocus={false}
          />

          <CustomText style={[styles.label, dyn.label]}>성별</CustomText>
          <TextInput
            style={[styles.input, styles.disabledInput, dyn.input]}
            value={getGenderInKorean(gender)} 
            editable={false} 
            selectTextOnFocus={false}
          />

          <CustomText style={[styles.label, dyn.label]}>사용자 역할</CustomText>
          <TextInput
            style={[styles.input, styles.disabledInput, dyn.input]}
            value={userRole} 
            editable={false} 
            selectTextOnFocus={false}
          />

          <CustomText style={[styles.label, dyn.label, {marginTop: 30}]}>비밀번호 수정</CustomText>

          {isPasswordEditing ? (
            // 1-1. 비밀번호 수정 모드일 때: 입력 필드 및 완료/취소 버튼 표시
            <View>
              <CustomText style={[styles.hint, dyn.label, {marginBottom: 10}]}>새 비밀번호는 8자 이상, 대문자, 숫자, 특수문자를 포함해야 합니다.</CustomText>
              <CustomText style={[styles.label, dyn.label]}>새 비밀번호</CustomText>
              <TextInput
                style={[styles.input, dyn.input]}
                placeholder="새 비밀번호"
                secureTextEntry
                value={pw}
                onChangeText={handleSetPw}
              />
              <CustomText style={[styles.label, dyn.label]}>비밀번호 확인</CustomText>
              <TextInput
                style={[styles.input, dyn.input]}
                placeholder="비밀번호 확인"
                secureTextEntry
                value={pw2}
                onChangeText={setPw2}
              />
              {pwMismatch ? <CustomText style={[styles.errorText, dyn.error]}>비밀번호가 일치하지 않습니다</CustomText> : null}
              {isSameAsCurrentPw && <CustomText style={[styles.errorText, dyn.error]}>기존 비밀번호와 동일한 비밀번호로는 변경할 수 없습니다.</CustomText>}

              {error ? <CustomText style={[styles.errorText, dyn.error]}>{error}</CustomText> : null}

              <TouchableOpacity
                style={[styles.actionBtn, styles.cancelBtn]}
                  onPress={() => {
                    setIsPasswordEditing(false);
                      setPw('');
                      setPw2('');
                      setIsSameAsCurrentPw(false); // ✅ 상태 초기화
                  }}
                  disabled={reseting}
              >
                  <CustomText style={styles.cancelText}>비밀번호 수정 취소</CustomText>
              </TouchableOpacity>
              
              <TouchableOpacity
                style={[styles.actionBtn, { backgroundColor: canChangePassword ? palette.primary : '#D9D9D9' }]}
                  onPress={() => {
                  //   if (pw.length >= 8 && !pwMismatch) {
                  //     saveProfile();
                  //   } else {
                  //     Alert.alert("알림", "유효한 비밀번호(8자 이상, 확인 일치)를 입력해 주세요.");
                  //   }
                  // }}
                  // disabled={reseting || !(pw.length >= 8 && !pwMismatch)}
                   if (canChangePassword) {
                    saveProfile();
                   } else {
                    Alert.alert("알림", "유효한 비밀번호(8자 이상, 확인 일치, 기존 비밀번호와 다름)를 입력해주세요.")
                   }
                  }}
                  disabled={reseting || !canChangePassword}
              >
                  {reseting ? <ActivityIndicator color="#fff" /> : <CustomText style={styles.submitText}>비밀번호 변경 완료</CustomText>}
              </TouchableOpacity>
            </View>

        ) : (
            // 1-2. 비밀번호 수정 모드가 아닐 때: '새 비밀번호 설정' 버튼 표시
            <TouchableOpacity
              style={[styles.input, styles.disabledInput, dyn.input, styles.passwordBtn]}
              onPress={() => { // 닉네임 유효성 검사 추가
                // 닉네임 필드가 비어있으면 모드 전환을 막습니다.
                if (!nickname || nickname.trim().length === 0) {
                    Alert.alert("알림", "비밀번호를 변경하려면 먼저 닉네임을 설정해야 합니다.");
                    return;
                }
                setIsPasswordEditing(true);
            }}
            >
              <CustomText style={[styles.passwordBtnText, dyn.text]}>새 비밀번호 설정</CustomText>
              <Icon name="chevron-right" size={24} color={dyn.text.color} />
            </TouchableOpacity>
        )}
        
        {/* 에러 메시지는 항상 표시 */}
        {!isPasswordEditing && error ? <CustomText style={[styles.errorText, dyn.error]}>{error}</CustomText> : null}

        {/* 최종 제출 버튼: 비밀번호 수정 모드가 아닐 때만 '프로필 수정' 버튼 활성화 */}
        {!isPasswordEditing && (
          <TouchableOpacity
            style={[
              styles.submitBtn,
              // { backgroundColor: (canChangeNickname || canChangePassword) ? palette.primary : '#D9D9D9' }
              { backgroundColor: canChangeNickname ? palette.primary : '#D9D9D9' }
            ]}
            // disabled={!(canChangeNickname || canChangePassword) || reseting}
            disabled={!canChangeNickname || reseting}
            onPress={saveProfile}
          >
            {reseting ? <ActivityIndicator color="#fff" /> : <CustomText style={styles.submitText}>프로필 수정</CustomText>}
          </TouchableOpacity>
        )}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container:{ flexGrow:1, paddingHorizontal:20, paddingTop:60 }, 
  header:{ alignItems:'center', justifyContent:'center', marginBottom:20 },
  backButton:{ position:'absolute', left:0 },
  title:{ fontSize:26, fontWeight:'bold' },
  form:{ marginTop:10 },
  label:{ marginTop:14, marginBottom:6, fontSize:14, fontWeight: '600' }, 
  input:{ height:50, borderColor:'#D9D9D9', borderWidth:1, borderRadius:8, paddingHorizontal:12, /* backgroundColor:'#fff' 삭제 */ },
  disabledInput: { 
    opacity: 0.8, 
    backgroundColor: '#F0F0F0',
  },
  submitBtn:{ height:52, borderRadius:10, justifyContent:'center', alignItems:'center', marginTop:22 },
  submitText:{ color:'#fff', fontSize:16, fontWeight:'700' },
  errorText:{ marginTop:6, color:'#FF3B30', fontSize:12 },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 10,
    fontSize: 16,
  },
  passwordBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingRight: 12,
    marginTop: 8,
  },
  passwordBtnText: {
    fontSize: 16,
    fontWeight: '500',
    opacity: 0.8,
  },
  actionBtn: {
    height: 52, 
    borderRadius: 10, 
    justifyContent: 'center', 
    alignItems: 'center', 
    marginTop: 15,
  },
  cancelBtn: {
    backgroundColor: '#fff',
    borderColor: '#D9D9D9',
    borderWidth: 1,
  },
  cancelText: {
    color: '#333',
    fontSize: 16,
    fontWeight: '700',
  },
});

export default UpdateProfile;
