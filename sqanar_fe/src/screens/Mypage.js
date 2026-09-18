// Mypage.js (refactored)
import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, ScrollView, RefreshControl,
  TouchableOpacity, ActivityIndicator, TextInput, Platform, Alert,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialIcons';
import { Picker } from '@react-native-picker/picker';
import apiClient from '../../api/apiClient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useSettings } from '../state/useSettings';
import { useFocusEffect } from '@react-navigation/native'; 
import Slider from '@react-native-community/slider';
import CustomText from '../../CustomText';
import AsyncStorage from '@react-native-async-storage/async-storage';

const Row = ({ left, right, topBorder }) => (
  <View style={[styles.row, topBorder && styles.rowTopBorder]}>
    <View style={{ flex: 1 }}>{left}</View>
    <View>{right}</View>
  </View>
);

// dyn 스타일을 주입 받을 수 있게 수정
const Section = ({ title, children, cardStyle, titleStyle }) => (
  <View style={styles.section}>
    <CustomText style={[styles.sectionTitle, titleStyle]}>{title}</CustomText>
    <View style={[styles.card, cardStyle]}>{children}</View>
  </View>
);

const Divider = () => <View style={styles.divider} />;

const MypageScreen = ({ navigation }) => {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [isGuest, setIsGuest] = useState(true);
  const [email, setEmail] = useState('-');
  const [nickname, setNickname] = useState('-');
  const [stats, setStats] = useState({ total: 0, legit: 0, malicious: 0 });
  const [editMode, setEditMode] = useState(false);
  const [nickDraft, setNickDraft] = useState('');

  // 글자크기 <-> 백엔드 font_scale(%) 변환
  const mapSizeToScale = useCallback((s) => ({
    xs: 90, sm: 95, md: 100, lg: 110, xl: 120,
  }[s] ?? 100), []);

  const { theme, fontSize, palette, baseFont, saveDisplay, setTheme, setFontSize } = useSettings();

  const mapScaleToSize = useCallback((p) => {
    if (p <= 92) return 'xs';
    if (p <= 97) return 'sm';
    if (p <= 105) return 'md';
    if (p <= 115) return 'lg';
    return 'xl';
  }, []);

  const [sliderValue, setSliderValue] = useState(3);

  const mapSizeToSliderValue = useCallback((s) => ({
    xs: 1, sm: 2, md: 3, lg: 4, xl: 5,
  }[s] ?? 3), []);

  const mapSliderValueToSize = useCallback((v) => {
    switch (v) {
      case 1: return 'xs';
      case 2: return 'sm';
      case 3: return 'md';
      case 4: return 'lg';
      case 5: return 'xl';
      default: return 'md';
    }
  }, []);

const getPickerStyle = (palette, baseFont) => ({
  width: 180,
  height: Platform.OS === 'android' ? 60 : 36,
  color: palette.text,
  fontSize: baseFont,
  ...(Platform.OS === 'android'
    ? { marginTop: -4, transform: [{ translateY: 0 }] }
    : {}),
});
const pickerWrapperStyle = {
  borderWidth: 1, borderColor: '#ddd', borderRadius: 10, overflow: 'hidden',
  height: 44,  
  justifyContent: 'center',
};

const dyn = useMemo(() => ({
  screenBg:      { backgroundColor: palette.bg },
  card:          { backgroundColor: palette.card, borderColor: palette.border },
  sectionTitle:  { color: palette.text, fontSize: Math.max(16, baseFont + 2) },
  rowTitle:      { color: palette.text, fontSize: Math.max(12, baseFont) },
  nicknameText:  { color: palette.text, fontSize: Math.max(18, baseFont + 2) },
  text:          { color: palette.text, fontSize: baseFont },
  subText:       { color: palette.sub,  fontSize: Math.max(11, baseFont - 2) },
  primaryBtn:    { backgroundColor: palette.primary },

  // 뱃지/버튼 동적 색
  chipOutline:        { borderColor: theme === 'dark' ? palette.text : '#687FE5' },
  chipTextOutline:    { color:      theme === 'dark' ? palette.text : '#687FE5' },
  chipSolidBg:        { backgroundColor: '#687FE5' },
  chipSolidText:      { color: '#fff' },
  authBtn:            theme === 'dark'
    ? { backgroundColor: palette.primary, borderColor: 'transparent' }
    : { backgroundColor: 'transparent',   borderColor: '#ddd' },
  authBtnText:        { color: theme === 'dark' ? '#fff' : palette.text },
  icon:               { color: theme === 'dark' ? '#fff' : palette.text },
}), [palette, baseFont, theme]);

const pickerItemColors = useMemo(() => {
  const isDark = theme === 'dark';
  return {
    // Picker.Item의 배경색 (메뉴 내부 배경)
    itemBg: isDark ? palette.card : '#FFFFFF', 
    // Picker.Item의 텍스트 색상
    itemText: isDark ? palette.text : '#111827', // 다크 모드: 흰색, 라이트 모드: 검은색
    // Picker에 표시되는 현재 선택 값의 색상은 getPickerStyle의 color: palette.text가 처리
  };
}, [theme, palette]);

const fetchMe = useCallback(async () => {
  setLoading(true);
  try {
    const res = await apiClient.get('/auth/me');
    const d = res.data || {};
    const _isLoggedIn = !!d.is_logged_in;
    const _isGuest = !!d.is_guest;

    setIsLoggedIn(_isLoggedIn);
    setIsGuest(_isGuest);

    // 게스트면 이메일은 숨기고, 회원이면 서버에서 받은 이메일 사용
    const safeEmail = _isGuest ? '-' : (d.email || '-');
    setEmail(safeEmail);
  
    const safeNick = _isGuest ? '게스트' : (d.nickname || 'user');
    setNickname(safeNick);
    setNickDraft(safeNick);

    try {
      const sres = await apiClient.get('/settings/json');
      const s = sres.data?.settings;
      if (s) {
        setTheme(s.display?.theme ?? 'light');
        const scale = Number(s.display?.font_scale ?? 100);
        setFontSize(mapScaleToSize(isNaN(scale) ? 100 : scale));
        // setSliderValue(mapSizeToSliderValue(setFontSize));
        setSliderValue(mapSizeToSliderValue(mapScaleToSize(isNaN(scale) ? 100 : scale)));
      }
    } catch (_) {}
    try {
      const hres = await apiClient.get('/settings/history/summary');
      const hs = hres.data || {};
      setStats({
        total: hs.total ?? 0,
        legit: hs.legit ?? 0,
        malicious: hs.malicious ?? 0,
      });
    } catch (e) {
      console.warn('History summary fetch error', e?.message);
    }
  } catch (e) {
    console.warn('mypage fetch error', e?.message);
    if (e.response?.status === 401) {
      await AsyncStorage.removeItem('access_token');
      delete apiClient.defaults.headers.common['Authorization'];
      setIsLoggedIn(false);
      setIsGuest(true);
      setEmail('-');
      setNickname('게스트');
      setNickDraft('게스트');
      Alert.alert('세션 만료', '로그인이 만료되었습니다. 다시 로그인해주세요.');
    }
  } finally {
    setLoading(false);
  }
}, [mapScaleToSize, setTheme, setFontSize, mapSizeToSliderValue]);

useFocusEffect(
  useCallback(() => {
    fetchMe(); 
  }, [fetchMe])
);

const onRefresh = useCallback(async () => {
  setRefreshing(true);
  await fetchMe();
  setRefreshing(false);
}, [fetchMe]);

const goHistory = useCallback(() => {
  navigation.navigate('History');
}, [navigation]);

const handleAuthAction = useCallback(async () => {
  if (isLoggedIn && !isGuest) {
    try {
      await apiClient.get('/auth/logout');
    } catch (e) {
      console.warn('Logout API call warning:', e?.message);
    } finally {
      await AsyncStorage.removeItem('access_token');
      delete apiClient.defaults.headers.common['Authorization'];

      setIsLoggedIn(false);
      setIsGuest(true);
      setEmail('-');
      setNickname('-');
      setNickDraft('-');
      // setNickname('게스트');
      // setNickDraft('게스트');

      Alert.alert('로그아웃', '성공적으로 로그아웃되었습니다.', [
        {
          text: '확인',
          onPress: () => {
            // 네비게이션 스택 리셋 (홈으로 이동)
            navigation.reset({
              index: 0,
              routes: [{ name: 'Home' }],
            });
          }
        }
      ]);
    }
      // // 네비게이션 스택 리셋
      // navigation.reset({
      //   index: 0,
      //   routes: [{ name: 'Home' }],
      // });

      // // 마이페이지 데이터 다시 읽기
      // fetchMe();
  } else {
    navigation.navigate('LoginForm');
  }
}, [isLoggedIn, isGuest, navigation]);

  const handleSaveProfile = useCallback(async () => {
    const body = { nickname: nickDraft?.trim() || nickname };
    try {
      // await apiClient.post('/profile/update', body);
      await apiClient.post('/auth/update-nickname', body);
      setNickname(body.nickname);
      setEditMode(false);
    } catch (e) {
      console.warn('save profile error', e?.message);
      // 실패해도 닫지 않고 유지
    }
  }, [nickDraft, nickname]);

  const handleSaveTheme = useCallback(async () => {
    // 선택: 테마 저장 엔드포인트가 있을 경우 호출
    // 예: POST /settings/save  body: { display: { theme } }
    try {
      await apiClient.post('/settings/save', { display: { theme } });
    } catch (e) {
      console.warn('save settings error', e?.message);
    }
  }, [theme]);

  const handleSliderChange = useCallback((value) => {
    const intValue = Math.round(value);
    const sizeKey = mapSliderValueToSize(intValue);

    setSliderValue(intValue);
    saveDisplay({ fontSize: sizeKey });
  }, [saveDisplay, mapSliderValueToSize]);

  if (loading) {
    return (
      <View style={[styles.container, dyn.screenBg, { alignItems: 'center', justifyContent: 'center' }]}>
        <ActivityIndicator size="large" color={palette.primary} />
      </View>
    );
  }

  return (
    <ScrollView
      style={[styles.container, dyn.screenBg]} 
      contentContainerStyle={{ padding: 16 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      <SafeAreaView>
        <View style={[styles.profileCard, dyn.card]}>
          <View style={styles.avatar}>
            <Icon name="account-circle" size={40} color="#666" />
          </View>
          <View style={{ flex: 1 }}>
            {editMode ? (
              <>
              <TextInput
                style={styles.input}
                value={isLoggedIn && !isGuest ? nickDraft : '게스트'}
                onChangeText={setNickDraft}
                placeholder="닉네임"
                autoCapitalize="none"
                editable={isLoggedIn && !isGuest}   // 비회원은 편집 불가
              />
              {isLoggedIn && !isGuest ? (
                <CustomText style={[styles.email, dyn.emailText]}>{email}</CustomText>
              ) : null}
              </>
            ) : (
              <>
                <CustomText style={[styles.nickname, dyn.nicknameText]}>
                  {isLoggedIn && !isGuest ? nickname : '게스트'}
                </CustomText>
                {isLoggedIn && !isGuest && email && email !== '-' && email.includes('@') ? (
                  <CustomText style={[styles.email, dyn.emailText]}>{email}</CustomText>
                ) : null}
              </>
          )}
            <View style={styles.badges}>
              <View style={[styles.chip, styles.chipOutline, dyn.chipOutline]}>
                <CustomText style={[styles.chipText, dyn.chipTextOutline]}>
                  {isLoggedIn && !isGuest ? '회원' : '비회원'}
                </CustomText>
              </View>
              {isLoggedIn && !isGuest ? (
                <View style={[styles.chip, styles.chipSolid, dyn.chipSolidBg]}>
                  <CustomText style={[styles.chipTextSolid, dyn.chipSolidText]}>Logged in</CustomText>
                </View>
              ) : null}
            </View>
          </View>

          <TouchableOpacity style={[styles.authBtn, dyn.authBtn]} onPress={handleAuthAction}>
            <Icon name={isLoggedIn && !isGuest ? 'logout' : 'login'} size={18} color={dyn.icon.color} />
            <CustomText style={[styles.authBtnText, dyn.authBtnText]}>
              {isLoggedIn && !isGuest ? '로그아웃' : '로그인'}
            </CustomText>
          </TouchableOpacity>
        </View>

        {isLoggedIn && !isGuest && (
          <Section title="프로필 설정" cardStyle={dyn.card} titleStyle={dyn.sectionTitle}>
            <Row
              left={
                <>
                  <CustomText style={[styles.rowTitle, dyn.rowTitle]}>닉네임</CustomText>
                  <CustomText style={[styles.muted, dyn.subText]}>
                    {editMode ? '변경 후 저장을 눌러주세요' : nickname}
                  </CustomText>
                </>
              }
              right={
                editMode ? (
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    <TouchableOpacity style={styles.saveBtn} onPress={handleSaveProfile}>
                      <Icon name="save" size={18} />
                      <CustomText style={styles.saveBtnText}>저장</CustomText>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.saveBtn, { borderColor: '#ddd', backgroundColor: '#fff' }]}
                      onPress={() => {
                        setEditMode(false);
                        setNickDraft(nickname);
                      }}
                    >
                      <Icon name="close" size={18} />
                      <CustomText style={[styles.saveBtnText, { color: '#333' }]}>취소</CustomText>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    <TouchableOpacity
                      style={styles.selector}
                      onPress={() => navigation.navigate('UpdateProfile')}
                    >
                      <CustomText style={styles.selectorText}>프로필 수정</CustomText>
                      <Icon name="open-in-new" size={18} />
                    </TouchableOpacity>
                  </View>
                )
              }
            />
          </Section>
        )}

        <Section title="히스토리 요약" cardStyle={dyn.card} titleStyle={dyn.sectionTitle}>
          <View style={{ paddingVertical: 8 }}>
            <View style={styles.statRow}>
              <View style={styles.statCard}>
                <CustomText style={styles.statNum}>{stats.total}</CustomText>
                <CustomText style={styles.statLabel}>전체</CustomText>
              </View>
              <View style={styles.statCard}>
                <CustomText style={styles.statNum}>{stats.legit}</CustomText>
                <CustomText style={styles.statLabel}>정상</CustomText>
              </View>
              <View style={styles.statCard}>
                <CustomText style={styles.statNum}>{stats.malicious}</CustomText>
                <CustomText style={styles.statLabel}>악성</CustomText>
              </View>
            </View>
            <TouchableOpacity style={styles.primaryBtn} onPress={goHistory}>
              <Icon name="open-in-new" size={18} color="#fff" />
              <CustomText style={styles.primaryBtnText}>히스토리 열기</CustomText>
            </TouchableOpacity>
          </View>
        </Section>

        <Section title="기본 설정" cardStyle={dyn.card} titleStyle={dyn.sectionTitle}>
          <Row
            left={
              <>
                <CustomText style={[styles.rowTitle, dyn.rowTitle]}>테마</CustomText>
                <CustomText style={[styles.muted, dyn.subText]}>라이트/다크</CustomText>
              </>
            }
            right={
              <View style={pickerWrapperStyle}>
                <Picker
                  selectedValue={theme}
                  onValueChange={(val) => { saveDisplay({ theme: val }); }}
                  style={getPickerStyle(palette, baseFont)}
                  dropdownIconColor={palette.text}
                  mode="dropdown"
                >
                  <Picker.Item label="라이트" value="light" color={pickerItemColors.itemText}  style={{ fontSize: baseFont, backgroundColor: pickerItemColors.itemBg }}  />
                  <Picker.Item label="다크" value="dark" color={pickerItemColors.itemText}  style={{ fontSize: baseFont, backgroundColor: pickerItemColors.itemBg }}/>
                </Picker>
              </View>
            }
          />
          <Divider />
          <Row
            left={<CustomText style={[styles.rowTitle, dyn.rowTitle]}>글자 크기</CustomText>}
            right={
              <View style={styles.sliderContainer}>
                <CustomText style={[styles.sliderLabel, dyn.subText]}>
                  {mapSliderValueToSize(sliderValue)} ({mapSizeToScale(mapSliderValueToSize(sliderValue))}%)
                  {/* {fontSize} ({mapSizeToScale(fontSize)}%) */}
                </CustomText>
              </View>
            }
          />
          <View style={{ paddingHorizontal: 12, paddingBottom: 16 }}>
            <Slider
              style={{ width: '100%', height: 40 }}
              minimumValue={1}
              maximumValue={5}
              step={1}
              value={sliderValue}
              onValueChange={setSliderValue}
              onSlidingComplete={handleSliderChange}
              minimumTrackTintColor={palette.primary}
              maximumTrackTintColor={palette.border}
              thumbTintColor={palette.primary}
            />
            <View style={styles.sliderTicks}>
                <CustomText style={dyn.subText}>XS</CustomText>
                <CustomText style={dyn.subText}>SM</CustomText>
                <CustomText style={dyn.subText}>MD</CustomText>
                <CustomText style={dyn.subText}>LG</CustomText>
                <CustomText style={dyn.subText}>XL</CustomText>
            </View>
          </View>
        </Section>

        <Section title="서비스 안내" cardStyle={dyn.card} titleStyle={dyn.sectionTitle}>
          <Row
            left={<CustomText style={[styles.rowTitle, dyn.rowTitle]}>공지사항</CustomText>}
            right={
              <TouchableOpacity onPress={() => navigation.navigate('NoticeScreen')}>
                <Icon name="chevron-right" size={22} color={dyn.icon.color} />
              </TouchableOpacity>
            }
          />
          <Divider />
            <Row
              left={<CustomText style={[styles.rowTitle, dyn.rowTitle]}>FAQ</CustomText>}
              right={
                <TouchableOpacity onPress={() => navigation.navigate('FAQ')}>
                  <Icon name="chevron-right" size={22} color={dyn.icon.color} />
                </TouchableOpacity>
              }
            />
          <Divider />
          <Row
            left={<CustomText style={[styles.rowTitle, dyn.rowTitle]}>앱 버전</CustomText>}
            right={<CustomText style={[styles.muted, dyn.subText]}>v1.0.0</CustomText>}
          />
        </Section>

        <Section title="개인정보·보안" cardStyle={dyn.card} titleStyle={dyn.sectionTitle}>
          <Row
            topBorder
            left={
              <>
                <CustomText style={[styles.rowTitle, dyn.rowTitle]}>카메라/저장소 권한</CustomText>
                <CustomText style={[styles.muted, dyn.subText]}>QR 스캔 및 임시 저장</CustomText>
              </>
            }
            right={<Icon name="lock" size={18} color="#999" />}
          />
        </Section>

        <View style={{ height: 24 }} />
      </SafeAreaView>
    </ScrollView>
  );
};

export default MypageScreen;

const styles = StyleSheet.create({
  container: { flex: 1 },
  profileCard: {
    backgroundColor: '#f5f7fb',
    borderRadius: 16,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  avatar: {
    width: 56, height: 56, borderRadius: 14,
    backgroundColor: '#e6ebf7',
    alignItems: 'center', justifyContent: 'center',
    marginRight: 12,
  },
  nickname: { fontSize: 18, fontWeight: '700' },
  email: { color: '#666', marginTop: 2 },
  badges: { flexDirection: 'row', gap: 8, marginTop: 8 },
  chip: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999 },
  chipOutline: { borderWidth: 1, borderColor: '#687FE5' },
  chipSolid: { backgroundColor: '#687FE5' },
  chipText: { fontSize: 12, color: '#687FE5' },
  chipTextSolid: { color: '#fff' },
  authBtn: {
    paddingVertical: 8, paddingHorizontal: 12,
    borderRadius: 10, borderWidth: 1, borderColor: '#ddd',
    flexDirection: 'row', alignItems: 'center', gap: 6,
  },
  authBtnText: { fontWeight: '600' },
  section: { marginBottom: 16 },
  sectionTitle: { fontSize: 16, fontWeight: '700', marginBottom: 8 },
  card: {
    backgroundColor: '#fff', borderRadius: 16, paddingHorizontal: 12,
    borderWidth: 1, borderColor: 'rgba(0,0,0,0.08)',
  },
  row: {
    paddingVertical: 14, flexDirection: 'row',
    alignItems: 'center', justifyContent: 'space-between',
  },
  rowTopBorder: { borderTopWidth: 1, borderTopColor: 'rgba(0,0,0,0.08)' },
  rowTitle: { fontSize: 14, fontWeight: '600' },
  muted: { color: '#666', marginTop: 2 },
  divider: { height: 1, backgroundColor: 'rgba(0,0,0,0.08)' },
  statRow: { flexDirection: 'row', gap: 8, paddingVertical: 12 },
  statCard: {
    flex: 1, backgroundColor: '#f5f7fb', borderRadius: 12,
    paddingVertical: 12, alignItems: 'center',
  },
  statNum: { fontSize: 18, fontWeight: '800' },
  statLabel: { color: '#666', marginTop: 4 },
  primaryBtn: {
    marginTop: 8, backgroundColor: '#687FE5', borderRadius: 12,
    paddingVertical: 12, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 8,
  },
  primaryBtnText: { color: '#fff', fontWeight: '700' },
  selector: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    borderWidth: 1, borderColor: '#ddd', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6,
    backgroundColor: '#fff',
  },
  selectorText: { fontWeight: '700' },
  saveBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 10, paddingVertical: 8,
    borderRadius: 10, borderWidth: 1, borderColor: '#687FE5',
    backgroundColor: 'rgba(37,99,235,0.08)',
  },
  saveBtnText: { color: '#687FE5', fontWeight: '800' },
  input: {
    backgroundColor: '#fff',
    borderWidth: 1, borderColor: '#ddd',
    borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 8,
    marginBottom: 6,
  },
  sliderContainer: {
    alignItems: 'flex-end',
    marginBottom: 4,
  },
  sliderLabel: {
    fontWeight: '600',
    minWidth: 50,
    textAlign: 'right',
  },
  sliderTicks: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
  }
});