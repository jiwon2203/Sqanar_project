import React, { useEffect, useState } from 'react';
import {
  StyleSheet, View, Text, Pressable, TouchableOpacity, TextInput, Keyboard,
  Alert, ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, TouchableWithoutFeedback
 } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialIcons';
import apiClient from '../../../api/apiClient';
import CustomText from '../../../CustomText';
import AsyncStorage from '@react-native-async-storage/async-storage';

const LoginFormScreen = ({ navigation }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [focusedInput, setFocusedInput] = useState(null);
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    const showSub = Keyboard.addListener('keyboardDidShow', () => setKeyboardVisible(true));
    const hideSub = Keyboard.addListener('keyboardDidHide', () => setKeyboardVisible(false));
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  const isValidEmail = (email) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };
  // const isFormValid = email.length > 0 && password.length > 0;
  const isFormValid = email.length > 0 && password.length > 0 && isValidEmail(email);

  // 로그인 처리 함수
  const handleLogin = async () => {
    if (!isFormValid || isLoading) return;
    try {
      setIsLoading(true);
      const dataToSend = { email: email.trim(), password };

      const res = await apiClient.post('/auth/loginProc', dataToSend, {
        validateStatus: () => true, // 200, 401 등 직접 확인
      });

      // const { success, message, access_token } = res.data;
      const { success, access_token, refresh_token, error } = res.data;

      if (res.status === 200 && success && access_token) {
        // 1. 토큰을 AsyncStorage에 저장
        await AsyncStorage.setItem('access_token', access_token);

        // 2. Axios 기본 헤더에 토큰 추가
        apiClient.defaults.headers.common['Authorization'] = `Bearer ${access_token}`;

        // 3. 메인 화면으로 이동
        Alert.alert('로그인 성공', '환영합니다!', [
          {
            text: '확인',
            onPress: () => navigation.reset({ index: 0, routes: [{ name: 'MainTab' }] }),
          },
        ]);
        
      } else if (res.status === 401) {
        // 백엔드에서 401 상태 코드와 함께 오류 메시지를 반환합니다.
        Alert.alert('로그인 실패', error || '이메일 또는 비밀번호를 확인해주세요.');
      //   navigation.reset({ index: 0, routes: [{ name: 'MainTab' }] });
      // } else if (res.status === 401 || !success) {
      //   Alert.alert('로그인 실패', message || '이메일 또는 비밀번호를 확인해주세요.');
      } else {
        Alert.alert('로그인 오류', '서버 오류가 발생했습니다. 잠시 후 다시 시도해주세요.');
      }
    } catch (err) {
      // Alert.alert('로그인 실패', '이메일 또는 비밀번호를 확인해주세요.');
      console.error('로그인 중 네트워크/서버 응답 오류:', err);
      Alert.alert('로그인 실패', '네트워크 연결 상태를 확인하거나 잠시 후 다시 시도해주세요.');
    } finally {
      setIsLoading(false);
    }
  };
  // 로그아웃 함수
  const handleLogout = async () => {
    try {
      await apiClient.post('/auth/logout');
      await AsyncStorage.removeItem('access_token');
      delete apiClient.defaults.headers.common['Authorization'];
      navigation.reset({ index: 0, routes: [{ name: 'LoginForm' }] });
    } catch (err) {
      Alert.alert('로그아웃 실패', '다시 시도해주세요.');
    }
  }
  //   try {
  //     setIsLoading(true);
  //     // 1. 전송 방식을 JSON 객체로 변경
  //     const dataToSend = {
  //         email: email.trim(),
  //         password: password,
  //         // 'redirectTo' 필드는 백엔드에서 사용되지 않으므로 제거하거나 유지
  //         redirectTo: '/home', 
  //         // guest_id가 필요하다면 여기서 추가
  //     };
      
  //     // 2. apiClient.post 호출 시 데이터와 헤더 수정
  //     // Axios(apiClient)는 객체를 전달하면 자동으로 'application/json'으로 처리합니다.
  //     const res = await apiClient.post('/auth/loginProc', dataToSend, {
  //         // 'Content-Type' 헤더를 명시적으로 제거하거나 'application/json'으로 설정합니다.
  //         // Axios는 객체 전송 시 기본적으로 'application/json'을 사용하므로 생략 가능합니다.
  //         // headers: { 'Content-Type': 'application/json' }, 
  //         withCredentials: true,
  //         validateStatus: () => true,
  //     });

  //     const data = res.data;
  //     const status = res.status;

  //     if (status === 200 && data.success) {
  //       // 성공 시 메인 화면으로 이동
  //       navigation.reset({ index: 0, routes: [{ name: 'MainTab' }] });
  //     } else if (status === 401 && !data.success) {
  //       Alert.alert('로그인 실패', data.message || '이메일 또는 비밀번호를 확인해주세요.');
  //     } else {
  //       Alert.alert('로그인 오류', '서버 오류가 발생했습니다. 잠시 후 다시 시도해주세요.');
  //     }
  //     // const finalURL = res?.request?.responseURL || res?.headers?.location || '';
  //     // if (finalURL.includes('/auth/login') && finalURL.includes('error=true')) {
  //     //   Alert.alert('로그인 실패', '이메일 또는 비밀번호를 확인해주세요.');
  //     //   return;
  //     // }
  //   } catch (err) {
  //     Alert.alert('로그인 실패', '이메일 또는 비밀번호를 확인해주세요.');
  //   } finally {
  //     setIsLoading(false);
  //   }
  // };
  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 60 : 0} // 필요시 조절
    >
      <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
        {/* ScrollView로 내용이 화면보다 길어질 때 스크롤 가능하게 */}
        <ScrollView
          contentContainerStyle={styles.scrollContainer}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.container}>
            <Pressable style={styles.backButton} onPress={() => navigation.goBack()}>
              <Icon name="close" size={35}></Icon>
            </Pressable>

            <CustomText style={styles.loginText}>Login</CustomText>

            <View style={styles.inputWrapper}>
              {focusedInput === 'email' || email !== '' ? (
                <CustomText style={styles.label}>Email</CustomText>
              ) : null}
              <TextInput
                placeholder={focusedInput === 'email' || email !== '' ? '' : 'Email'}
                value={email}
                onChangeText={setEmail}
                onFocus={() => setFocusedInput('email')}
                onBlur={() => setFocusedInput(null)}
                style={focusedInput === 'email' ? styles.input2 : styles.input1}
                keyboardType='email-address'
                autoCapitalize='none'
                autoCorrect={false}
                returnKeyType="next"
                onSubmitEditing={() => { /* 다음 입력으로 포커스 이동을 원하면 ref로 구현 가능 */ }}
              />
              {email !== '' && !isValidEmail(email) && (
                <CustomText style={styles.errorText}>올바른 이메일 형식을 입력해주세요</CustomText>
              )}
            </View>
            <View style={styles.inputWrapper}>
              {focusedInput === 'password' || password !== '' ? (
                <CustomText style={styles.label}>Password</CustomText>
              ) : null}
              <TextInput
                placeholder='password'
                value={password}
                onChangeText={setPassword}
                onFocus={() => setFocusedInput('password')}
                onBlur={() => setFocusedInput(null)}
                style={focusedInput === 'password' ? styles.input2 : styles.input1}
                secureTextEntry
                autoCorrect={false}
                returnKeyType="done"
                onSubmitEditing={handleLogin}
                />      
            </View>
          
            <TouchableOpacity
            style={[styles.loginButton,
              {backgroundColor: isFormValid ? '#687FE5' : '#D9D9D9'}
            ]}
            disabled={!isFormValid || isLoading}
            onPress={handleLogin}
            activeOpacity={0.8}
            >
              {isLoading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <CustomText style={{ color: isFormValid ? '#fff' : '#757575', fontSize: 16 }}>로그인</CustomText>
              )}
            </TouchableOpacity>
            <View style={styles.auth}>
              <Pressable onPress={() => navigation.navigate('ResetPW')}>
                {({ pressed }) => (
                  <CustomText style={[styles.authText, pressed && { color: '#1A76FE' }]}>비밀번호 재설정</CustomText>
                )}
              </Pressable>
              <View style={styles.separator} />
              <Pressable onPress={() => navigation.navigate('SignUp')}>
                {({ pressed }) => (
                  <CustomText style={[styles.authText, pressed && { color: '#1A76FE' }]}>
                    회원가입
                  </CustomText>
                )}
              </Pressable>
              {/* <View style={styles.separator} /> */}
              {/* <Pressable onPress={() => navigation.navigate('GuestLogin')}>
              {({ pressed }) => (
                <CustomText style={[styles.authText, pressed && { color: '#1A76FE' }]}>비회원 로그인</CustomText>
                )}
                </Pressable> */}
            </View>
          </View>
        </ScrollView>
      </TouchableWithoutFeedback>
    </KeyboardAvoidingView>
  );
};
const styles = StyleSheet.create({
  scrollContainer: {flexGrow: 1,},
  container: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#ffffff' },
  backButton: {position: 'absolute', top: 50, left: 30, },
  loginText: {
    fontSize: 50, fontWeight: '500', marginTop: 100, marginBottom: 40,
    alignSelf: 'flex-start', margin: 30,
  },
  inputWrapper: {width: 340, height: 60, marginBottom: 20, position: 'relative', },
  label: { 
    fontSize: 11, color: '#8B8C8D', fontWeight: '500',
    position: 'absolute', top: 8, left: 16, zIndex: 1},
  input1: {
    width: '100%', height: '100%',
    borderRadius: 10, borderColor: '#9E9E9E', borderWidth: 1,
    paddingHorizontal: 16,
    fontSize: 18,},
  input2: {
    width: '100%', height: '100%',
    borderRadius: 10, borderColor: '#9E9E9E', borderWidth: 1,
    backgroundColor: '#F3F8FF',
    paddingHorizontal: 15,
    fontSize: 18,
  },
  errorText: {color: '#FF4444', fontWeight: '400', fontSize: 10, },
  loginButton: {
    width: 345, height: 50, borderRadius: 10,
    justifyContent: 'center', alignItems: 'center',
    marginBottom: 20,
  },
  auth: {flexDirection: 'row', alignItems: 'center', justifyContent: 'center', flexWrap: 'wrap', },
  authText: {fontWeight: '500', fontSize: 15,},
  separator: {
    width: 1, height: 12, backgroundColor: '#D9D9D9', marginHorizontal: 15,
  }
});
export default LoginFormScreen;