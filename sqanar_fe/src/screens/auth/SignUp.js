import React, {useState, useEffect, useMemo} from 'react';
import {
  StyleSheet, View, Text, Pressable, TouchableOpacity, TextInput,
  KeyboardAvoidingView, Platform, ScrollView, Keyboard, TouchableWithoutFeedback, 
  ActivityIndicator, Alert
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialIcons';
import { Picker } from '@react-native-picker/picker'; 
import DatePicker from 'react-native-date-picker';
import apiClient from '../../../api/apiClient';
import CustomText from '../../../CustomText';

// ── 유틸: 로컬 YYYY-MM-DD 포맷/파서 (UTC 영향 없음)
const toLocalYmd = (d) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
};
const fromYmd = (ymd) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/;
  const hit = m.exec(ymd);
  if (!hit) return null;
  const [_, yy, MM, dd] = hit.map(Number);
  const dt = new Date(yy, MM - 1, dd, 12, 0, 0, 0); // 정오 고정
  if (dt.getFullYear() !== yy || (dt.getMonth() + 1) !== MM || dt.getDate() !== dd) return null;
  return dt;
};

// ── 숫자 입력을 YYYY-MM-DD로 자동 변환
const formatYmdInput = (raw) => {
  // 숫자만 추출하고 최대 8자리(YYYYMMDD)까지만 유지
  const digits = (raw || '').replace(/\D/g, '').slice(0, 8);
  const len = digits.length;
  if (len <= 4) return digits;                         // YYYY
  if (len <= 6) return `${digits.slice(0,4)}-${digits.slice(4)}`; // YYYY-MM
  return `${digits.slice(0,4)}-${digits.slice(4,6)}-${digits.slice(6,8)}`; // YYYY-MM-DD
};

// ── 생년월일 입력 필드: 텍스트 입력 + 달력 모달
const BirthdateField = ({label = '생년월일', valueYmd, onChangeYmd, maxDate = new Date()}) => {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState(valueYmd ?? '');
  const [error, setError] = useState('');

  useEffect(() => { setInput(valueYmd ?? ''); }, [valueYmd]);

  const canOpenPicker = useMemo(() => true, []);

  const handleChange = (t) => {
    const formatted = formatYmdInput(t);
    setInput(formatted);
    if (error) setError('');
  };

  const handleBlur = () => {
    if (!input) { setError(''); onChangeYmd(''); return; }
    const dt = fromYmd(input);
    if (!dt) { setError('날짜 형식이 올바르지 않습니다 (예: 2000-01-01)'); return; }
    const maxNoon = new Date(maxDate.getFullYear(), maxDate.getMonth(), maxDate.getDate(), 12);
    if (dt > maxNoon) { setError('미래 날짜는 선택할 수 없습니다'); return; }
    setError('');
    onChangeYmd(toLocalYmd(dt));
  };

  return (
    <View style={styles.inputRow}>
      <View style={styles.fieldRow}>
        <CustomText style={styles.label}>{label}</CustomText>
        <View style={{flex:1, flexDirection:'row', alignItems:'center'}}>
          <TextInput
            style={[styles.input, error && {borderColor:'#FF3B30'}]}
            placeholder="예: 2000-01-01"
            value={input}
            onChangeText={handleChange}
            onBlur={handleBlur}
            keyboardType="number-pad"
            inputMode="numeric"
            maxLength={10} // YYYY-MM-DD
          />
          <TouchableOpacity
            style={[styles.iconBtn, {marginLeft: 8}]}
            onPress={() => setOpen(true)}
            disabled={!canOpenPicker}
          >
            <Icon name="calendar-today" size={20} color="#1A76FE" />
          </TouchableOpacity>
        </View>

        {error ? <CustomText style={styles.errorText}>{error}</CustomText> : null}

        <DatePicker
          modal
          mode="date"
          locale="ko"
          open={open}
          date={fromYmd(valueYmd) ?? new Date(2000, 0, 1, 12)}  // 기본값(정오)
          maximumDate={new Date()}                               // 오늘까지만
          onConfirm={(selected) => {
            setOpen(false);
            const fixed = new Date(
              selected.getFullYear(), selected.getMonth(), selected.getDate(),
              12, 0, 0, 0
            );
            const ymd = toLocalYmd(fixed);
            setInput(ymd);
            setError('');
            onChangeYmd(ymd);
          }}
          onCancel={() => setOpen(false)}
        />
      </View>
    </View>
  );
};

const PW_REGEX = /^(?=.*[A-Z])(?=.*\d)(?=.*[!#%\^*])[A-Za-z\d!#%\^*]{8,}$/;

const SignUpScreen = ({navigation}) => {
  const [email, setEmail]             = useState('');
  const [checkingEmail, setCheckingEmail] = useState(false);
  const [emailExists, setEmailExists] = useState(null);
  const [password, setPassword]       = useState('');
  const [confirmPassword, setConfirm] = useState('');
  const [passwordMismatch, setPwMis]  = useState('');
  const [nickname, setNickname]       = useState('');
  const [birthdate, setBirthdate]     = useState(''); // YYYY-MM-DD
  const [gender, setGender]           = useState('N'); // N/M/F

  const [submitting, setSubmitting]   = useState(false);

  const weakPassword = password.length > 0 && !PW_REGEX.test(password);
  const isValidEmail = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);

  const isFormValid =
    email.trim() !== '' &&
    password.trim() !== '' &&
    confirmPassword.trim() !== '' &&
    password === confirmPassword &&
    !weakPassword &&
    nickname.trim() !== '' &&
    !!birthdate;

  // 이메일 중복 검사
  const checkEmail = async () => {
    try {
      setCheckingEmail(true);
      const res = await apiClient.get('/auth/check-email', { params: { email }});
      setEmailExists(!!res?.data?.exists);
      if (res?.data?.exists) {
        Alert.alert('중복 확인', '이미 사용 중인 이메일입니다.');
      } else {
        Alert.alert('중복 확인', '사용 가능한 이메일입니다.');
      }
    } catch (e) {
      Alert.alert('오류', '이메일 확인 중 오류가 발생했습니다.');
    } finally {
      setCheckingEmail(false);
    }
  };

  useEffect(() => {
    if (confirmPassword.length > 0 && password !== confirmPassword) {
      setPwMis('비밀번호가 일치하지 않습니다');
    } else {
      setPwMis('');
    }
  }, [password, confirmPassword]);

  const handleSubmit = async () => {
    if (!isFormValid || emailExists === true) {
        if (emailExists === true) {
            Alert.alert('회원가입 실패', '이미 사용 중인 이메일입니다. 다른 이메일을 사용해주세요.');
        }
        return;
    }

    const form = new FormData();
    form.append('email', email.trim());
    form.append('password', password);
    form.append('nickname', nickname.trim());
    form.append('birthDate', birthdate); 
    form.append('gender', gender || 'N'); 

    try {
      setSubmitting(true);
      const res = await apiClient.post('/auth/registerProc', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
        validateStatus: () => true,
      });

      const status   = res?.status ?? 0;
      const finalURL = res?.request?.responseURL || res?.headers?.location || '';

      if (status >= 300 && status < 400) {
        if (finalURL.includes('/auth/login')) {
          Alert.alert('회원가입 성공', '회원가입이 완료되었습니다. 로그인 화면으로 이동합니다.', [
            { text: '확인', onPress: () => navigation.replace('LoginForm') }
          ]);
          return;
        }
      }
      if (status === 409) {
        Alert.alert('회원가입 실패', '아이디 중복확인이 필요합니다.');
        return;
      }
      if (status === 200 && finalURL.includes('/auth/login')) {
        Alert.alert('회원가입 성공', '회원가입이 완료되었습니다. 로그인 화면으로 이동합니다.', [
          { text: '확인', onPress: () => navigation.replace('LoginForm') }
        ]);
        return;
      }
      if (finalURL.includes('error=weak_password')) {
        Alert.alert('비밀번호 규칙', '영문 대문자, 숫자, 특수문자를 포함하여 8자 이상으로 설정해주세요.');
        return;
      }
      if (status >= 200 && status < 400) {
        Alert.alert('회원가입 성공', '회원가입이 완료되었습니다. 로그인 화면으로 이동합니다.', [
          { text: '확인', onPress: () => navigation.replace('LoginForm') }
        ]);
      } else {
        Alert.alert('오류', '회원가입에 실패했습니다. 잠시 후 다시 시도해주세요.');
      }
    } catch (e) {
      Alert.alert('오류', '네트워크 오류가 발생했습니다.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <KeyboardAvoidingView style={{flex: 1}} behavior={Platform.select({ ios: 'padding', android: 'height' })}>
      <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
        <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
          <View style={styles.header}>
            <Pressable style={styles.backButton} onPress={() => navigation.goBack()}>
              <Icon name="arrow-back" size={35}/>
            </Pressable>
            <CustomText style={styles.title}>회원가입</CustomText>
          </View>

          <View style={styles.formWrapper}>
            {/* 이메일 */}
            <View style={styles.inputRow}>
              <View style={styles.fieldRow}>
                <CustomText style={styles.label}>아이디</CustomText>
                <TextInput
                  style={styles.input}
                  placeholder="이메일 입력"
                  autoCapitalize="none"
                  keyboardType="email-address"
                  value={email}
                  onChangeText={(t)=>{setEmail(t); setEmailExists(null);}}
                />
                <TouchableOpacity
                  style={[styles.smallBtn, {backgroundColor: email.trim() ? '#687FE5' : '#D9D9D9'}]}
                  onPress={checkEmail}
                  disabled={!email.trim() || checkingEmail}
                >
                  {checkingEmail ? <ActivityIndicator color="#fff" /> : <CustomText style={styles.smallBtnText}>중복확인</CustomText>}
                </TouchableOpacity>
              </View>
              {email !== '' && !isValidEmail(email) && (
                <CustomText style={styles.errorText}>올바른 이메일 형식을 입력해주세요</CustomText>
              )}
            </View>
            {emailExists === true && <CustomText style={styles.errorText}>이미 사용 중인 이메일입니다.</CustomText>}

            {/* 비밀번호 */}
            <View style={styles.inputRow}>
              <View style={styles.fieldRow}>
                <CustomText style={styles.label}>비밀번호</CustomText>
                <TextInput
                  style={[styles.input, weakPassword && {borderColor:'#FF3B30'}]}
                  placeholder="비밀번호 입력"
                  secureTextEntry
                  value={password}
                  onChangeText={setPassword}
                />
              </View>
              {weakPassword && (
                <CustomText style={styles.helpText}>
                  8자 이상, 대문자/숫자/특수문자(!#%^*) 포함
                </CustomText>
              )}
            </View>

            {/* 비밀번호 확인 */}
            <View style={styles.inputRow}>
              <View style={styles.fieldRow}>
                <View style={{ width: 90, marginRight: 10 }} />
                <TextInput
                  style={styles.input}
                  placeholder="비밀번호 확인"
                  secureTextEntry
                  value={confirmPassword}
                  onChangeText={setConfirm}
                />
              </View>
            </View>
            {passwordMismatch ? <CustomText style={styles.errorText}>{passwordMismatch}</CustomText> : null}

            {/* 닉네임 */}
            <View style={styles.inputRow}>
              <View style={styles.fieldRow}>
                <CustomText style={styles.label}>이름</CustomText>
                <TextInput
                  style={styles.input}
                  placeholder="닉네임 입력"
                  value={nickname}
                  onChangeText={setNickname}
                />
              </View>
            </View>

            {/* 생년월일: 자동 하이픈 + 달력 */}
            <BirthdateField valueYmd={birthdate} onChangeYmd={setBirthdate}/>

            {/* 성별 드롭다운 */}
            <View style={styles.inputRow}>
              <View style={styles.fieldRow}>
                <CustomText style={styles.label}>성별</CustomText>
                <View style={[styles.input, {padding:0}]}>
                  <Picker
                    selectedValue={gender}
                    onValueChange={(v) => setGender(v)}
                  >
                    <Picker.Item label="입력안함" value="N" />
                    <Picker.Item label="남자" value="M" />
                    <Picker.Item label="여자" value="F" />
                  </Picker>
                </View>
              </View>
            </View>

            {/* 제출 */}
            <TouchableOpacity
              style={[styles.signupButton, { backgroundColor: isFormValid ? '#1A76FE' : '#D9D9D9' }]}
              disabled={!isFormValid || submitting}
              onPress={handleSubmit}
            >
              {submitting
                ? <ActivityIndicator size="small" color="#FFFFFF" />
                : <CustomText style={[styles.signupButtonText, {color: isFormValid ? '#FFFFFF' : '#757575'}]}>가입하기</CustomText>}
            </TouchableOpacity>
          </View>
        </ScrollView>
      </TouchableWithoutFeedback>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', paddingHorizontal: 20, backgroundColor: '#ffffff' },
  header: {
    marginTop: 60, marginBottom: 30,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
  },
  backButton: { position: 'absolute', left: 20, marginRight: 30 },
  title: { fontSize: 30, fontWeight: 'bold', lineHeight: 35 },
  formWrapper: { flex: 1, justifyContent: 'center' },
  inputRow: { flexDirection: 'column', marginBottom: 16 },
  fieldRow: {  flexDirection: 'row', alignItems: 'center', },
  label: { width: 90, fontSize: 14, marginRight: 10 },
  input: {
    flex: 1, height: 50, borderColor: '#D9D9D9', borderWidth: 1,
    paddingHorizontal: 10, borderRadius: 6, justifyContent: 'center',
  },
  iconBtn: {
    width: 44, height: 50, borderColor:'#D9D9D9', borderWidth:1,
    borderRadius: 6, justifyContent:'center', alignItems:'center',
    backgroundColor:'#F7FAFF'
  },
  signupButton: {
    width: '100%', height: 50, borderRadius: 10,
    justifyContent: 'center', alignItems: 'center', marginTop: 20,
  },
  smallBtn: {
    height: 50, paddingHorizontal: 12, borderRadius: 8, alignItems:'center', justifyContent:'center'
  },
  signupButtonText: { fontSize: 16, fontWeight: 'bold' },
  errorText: { color: '#FF0000', fontSize: 12,  marginTop: -6, marginBottom: 10 },
  helpText: { color: '#666', fontSize: 12, marginTop: 6, marginBottom: 10 },
});

export default SignUpScreen;
