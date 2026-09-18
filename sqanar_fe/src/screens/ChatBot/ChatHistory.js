// screens/Chatbot/ChatHistory.js

import React, { useCallback, useState } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialIcons';
import { getChatHistory } from '../../../api/chat';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import apiClient from '../../../api/apiClient';
import { useSettings } from '../../state/useSettings'; 
import CustomText from '../../../CustomText';

export default function ChatHistory({ navigation, route }) {
  const [items, setItems] = useState([]);
  // onRestore = route.params?.onRestore;
  const [loginRequired, setLoginRequired] = useState(true);
  const { palette } = useSettings();
  const dyn = {
    wrap: { backgroundColor: palette.bg },
    text: { color: palette.text },
    sub: { color: palette.sub },
    border: { borderBottomColor: palette.border },
    guestIcon: { color: palette.sub }, // 잠금 아이콘 색상
    guestTitle: { color: palette.text },
    guestDesc: { color: palette.sub },
    title: { color: palette.text },
  };

  useFocusEffect(
    useCallback(() => { 
      let isActive = true;
      const fetchUserAndHistory = async () => {
        try {
          const { data } = await apiClient.get('/auth/me', { params: { format: 'json' } });
          if (!isActive) return;

          if (data.is_logged_in) {
            setLoginRequired(false);
            const historyData = await getChatHistory();
            if (isActive) setItems(historyData.sessions || []);
          } else {
            setLoginRequired(true);
            setItems([]);
          }

        } catch (e) {
          if (isActive) {
            setLoginRequired(true);
            setItems([]);
          }
        }
      };

      fetchUserAndHistory();
      return () => { isActive = false; };
    }, [])
  );

  const select = (item) => {
    navigation.navigate('Chatbot', {
      restoreSessionId: item.id,
    });
  };


  const ttlLabel = (sec) => {
    if (sec == null) return '';
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    if (h > 0) return `만료까지 약 ${h}시간 ${m}분`;
    if (m > 0) return `만료까지 약 ${m}분`;
    return '곧 만료';
  };

  if (loginRequired) {
    return (
      <SafeAreaView style={[s.wrap, dyn.wrap]}> 
        <View style={s.header}>
          <TouchableOpacity onPress={() => navigation.goBack()}>
            <Icon name="arrow-back" size={22} color={dyn.text.color} /> 
          </TouchableOpacity>
          <CustomText style={[s.title, dyn.title]}>Chatbot History</CustomText> 
          <View style={{ width:22 }} />
        </View>

        <View style={s.guestWrap}>
          <Icon name="lock" size={40} color={dyn.guestIcon.color} /> 
          <CustomText style={[s.guestTitle, dyn.guestTitle]}>로그인 후 이용할 수 있어요</CustomText> 
          <CustomText style={[s.guestDesc, dyn.guestDesc]}>대화 히스토리는 로그인한 사용자만 확인 가능합니다.</CustomText> 
        </View>
      </SafeAreaView>
    );
  }

    return (
     <SafeAreaView style={[s.wrap, dyn.wrap]}>
      <View style={[s.header, { borderBottomColor: palette.border }]}> 
        <TouchableOpacity onPress={() => navigation.goBack()}><Icon name="arrow-back" size={22} color={dyn.text.color} /></TouchableOpacity>
        <CustomText style={[s.title, dyn.title]}>Chatbot History</CustomText>
        <View style={{ width: 22 }} />
      </View>
      <FlatList
        data={items}
        keyExtractor={(it) => it.id.toString()}
        renderItem={({ item }) => (
          <TouchableOpacity style={[s.row, { borderBottomColor: palette.border }]} onPress={() => select(item)}> 
            <Icon name="chat-bubble-outline" size={18} color={dyn.text.color} /> 
            <View style={{ flex: 1 }}>
              <CustomText style={[s.main, dyn.text]} numberOfLines={1}>{item.title || '(대화 요약)'}</CustomText> 
              <CustomText style={[s.sub, dyn.sub]}>{item.created_at ? new Date(item.created_at).toLocaleString('ko-KR') : '-'}</CustomText> 
              {item.ttl_seconds != null && <CustomText style={[s.ttl, dyn.sub]}>{ttlLabel(item.ttl_seconds)}</CustomText>} 
            </View>
          </TouchableOpacity>
        )}
        ListEmptyComponent={<CustomText style={[s.empty, dyn.sub]}>대화 기록이 없습니다.</CustomText>} 
      />
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  wrap:{ flex:1 }, 
  header:{ flexDirection:'row', alignItems:'center', justifyContent:'space-between', padding:12, borderBottomWidth:1 }, 
  title:{ fontSize:16, fontWeight:'700' },
  row:{ flexDirection:'row', alignItems:'center', gap:10, padding:12, borderBottomWidth:1 }, 
  main:{ fontWeight:'600' },
  sub:{ fontSize:12, marginTop:2 }, 
  ttl:{ fontSize:11, marginTop:2 }, 
  empty:{ marginTop:16, textAlign:'center' },
  guestWrap:{ flex:1, alignItems:'center', justifyContent:'center', padding:24 },
  guestTitle:{ marginTop:10, fontSize:16, fontWeight:'700' }, 
  guestDesc:{ marginTop:6, fontSize:13, textAlign:'center' }, 
  loginBtn:{ marginTop:14, backgroundColor:'#4682A9', paddingVertical:10, paddingHorizontal:16, borderRadius:8 },
  loginBtnText:{ color:'#fff', fontWeight:'700' },
});