// src/components/WebViewCard.tsx
import React from "react";
import { View, StyleSheet, ActivityIndicator, TouchableOpacity, Text, Dimensions } from "react-native";
import { WebView } from "react-native-webview";
import Icon from "react-native-vector-icons/MaterialIcons";
import CustomText from "../../CustomText";

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");

interface WebViewCardProps {
  url: string;
  onClose: () => void;
}

export default function WebViewCard({ url, onClose }: WebViewCardProps) {
  return (
    <View style={styles.overlay}>
      <View style={styles.card}>
        {/* 상단 닫기 버튼 */}
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose} style={styles.closeButton}>
            <Icon name="arrow-back" size={22} color="#333" />
          </TouchableOpacity>
          <CustomText style={styles.title}>미리보기</CustomText>
        </View>

        {/* WebView */}
        <WebView
          source={{ uri: url }}
          style={styles.webview}
          startInLoadingState={true}
          renderLoading={() => (
            <ActivityIndicator
              size="large"
              color="#ffcc00"
              style={styles.loading}
            />
          )}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: "absolute",
    top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 20,
  },
  card: {
    width: SCREEN_WIDTH * 0.8,
    height: SCREEN_HEIGHT * 0.6,
    backgroundColor: "#fff",
    borderRadius: 16,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 6,
  },
  header: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#f9f9f9",
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#ddd",
  },
  closeButton: {
    position: "absolute",
    left: 10,
    padding: 6,
  },
  title: { fontSize: 16, fontWeight: "600", color: "#333" },
  webview: { flex: 1 },
  loading: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
});
