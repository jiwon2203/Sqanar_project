//BottomTab.js

import React, { useMemo } from 'react';   
import { View, TouchableOpacity, Platform, StyleSheet, Text } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import Icon from 'react-native-vector-icons/MaterialIcons';
import HomeScreen from '../screens/Home';
import ChatbotScreen from '../screens/ChatBot/ChatbotScreen';
import QRCameraScreen from '../screens/QRCameraScreen';
import HistoryScreen from '../screens/History';
import MypageScreen from '../screens/Mypage';
import { useSettings } from '../state/useSettings';
import CustomText from '../../CustomText';

// const { UnityLauncher } = NativeModules;

const Tab = createBottomTabNavigator();

const COLORS = {
  primary: '#687FE5',   // 중앙 원
  inactive: '#9AA0A6',  // 비활성 아이콘/라벨
  active: '#202124',    // 활성 아이콘/라벨
  barBg: '#FFFFFF',     // 탭바 배경(흰색)
};

const QRTabButton = ({ onPress }) => (
  <TouchableOpacity activeOpacity={0.9} onPress={onPress} style={styles.qrButtonWrapper}>
    <View style={styles.qrCircle}>
      <Icon name="document-scanner" size={35} color="#FFFFFF" />
    </View>
  </TouchableOpacity>
);

  const BottomTabNavigator = () => {
  /*  변경: palette/baseFont 사용 */
  const { palette, baseFont } = useSettings(); 
  const active = palette.text;                
  const inactive = palette.sub;     
  const FIXED_FONT_SIZE = 14;

  /*  변경: tabBarStyle 동적 색상 주입 */
  const tabBarStyles = [
   styles.tabBar,
   { backgroundColor: palette.tab, borderTopColor: palette.border }
 ];

  return (
    <Tab.Navigator
      key={`${palette.tab}-${baseFont}`} 
      initialRouteName='Home'
      screenOptions={{
        headerShown: false,
        tabBarShowLabel: true,
        tabBarActiveTintColor: active,                  
        tabBarInactiveTintColor: inactive,              
        tabBarStyle: tabBarStyles, 
        tabBarItemStyle: { justifyContent:'center', alignItems:'center', width:60 },
        tabBarLabelStyle: { marginTop: 2, fontSize: FIXED_FONT_SIZE }, // 
        tabBarIconStyle: { marginTop: 4 }
      }}
    >
     <Tab.Screen
        name="Home"
        component={HomeScreen}
        options={{
          tabBarIcon: ({ color }) => <Icon name="home" color={color} size={28} />,
          tabBarLabel: ({ color }) => <CustomText style={{ color, fontSize: FIXED_FONT_SIZE }}>홈</CustomText>,
        }}
      />
      <Tab.Screen name="ChatBot" component={ChatbotScreen} options={{
        tabBarLabel: ({ color }) => (
          <CustomText style={{ color, fontSize: FIXED_FONT_SIZE }}>챗봇</CustomText>
        ),
        tabBarIcon: ({ color }) => <Icon name="forum" color={color} size={28} />,
        tabBarStyle: { display: 'none' },
      }}/>

      <Tab.Screen
        name="QRCameraScreen"
        component={QRCameraScreen}
        options={{
          tabBarButton: (props) => <QRTabButton {...props} />,
          tabBarStyle: { display: 'none' },
        }}
      />

      <Tab.Screen name="History" component={HistoryScreen} options={{
        tabBarLabel: ({ color }) => <CustomText style={{ color, fontSize: FIXED_FONT_SIZE }}>기록</CustomText>,
        tabBarIcon: ({ color }) => <Icon name="assignment" color={color} size={28} />,
      }}/>
      <Tab.Screen name="MyPage" component={MypageScreen} options={{
        tabBarLabel: ({ color }) => <CustomText style={{ color, fontSize: FIXED_FONT_SIZE }}>마이페이지</CustomText>,
        tabBarIcon: ({ color }) => <Icon name="person" color={color} size={28} />,
      }}/>
    </Tab.Navigator>
  );
};

export default BottomTabNavigator;
const styles = StyleSheet.create({
  tabBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor:  COLORS.barBg,
    borderTopWidth: 0,
    borderTopColor: '#E6E8EC',
    elevation: 12,
    height: 65,
    // paddingBottom: 20,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: -2 },
        shadowOpacity: 0.06,
        shadowRadius: 4,
      },
    }),
  },

  qrButtonWrapper: {
    justifyContent: 'center',
    alignItems: 'center',
    paddingBottom: 4, // 아이콘 수직 중앙 맞춤
  },

  qrCircle: {
    width: 70,
    height: 70,
    borderRadius: 40,
    backgroundColor: COLORS.primary,
    justifyContent: 'center',
    alignItems: 'center',
    paddingBottom: 4, // 아이콘 수직 중앙 맞춤
    ...Platform.select({
      ios: {
        shadowColor: COLORS.primary,
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.25,
        shadowRadius: 8,
      },
      android: { elevation: 8 },
    }),
  },
});