import React, { useRef, useState, useCallback } from 'react';
import {
  View, Text, Image, StyleSheet, TouchableOpacity,
  FlatList, Dimensions, Platform
} from 'react-native';

const { width, height } = Dimensions.get('window');

const slides = [
  {
    id: '1',
    image: require('../../assets/images/start_img.png'),
    imgStyle: { width: '92%' },
    title: 'Scan QR codes safely',
    subtitle: 'Check the QR code and use the AI security assistant service',
  },
  {
    id: '2',
    image: require('../../assets/images/start_img2.jpg'),
    imgStyle: { width: '88%' },
    title: 'Chatbot Assistant',
    subtitle: 'Ask questions about the scanned QR code and get instant answers',
  },
];

const StartScreen = ({ navigation }) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const flatListRef = useRef(null);

  const onViewableItemsChanged = useRef(({ viewableItems }) => {
    if (viewableItems?.length > 0 && viewableItems[0]?.index != null) {
      setCurrentIndex(viewableItems[0].index);
    }
  }).current;
  const viewConfig = useRef({ viewAreaCoveragePercentThreshold: 50 }).current;

  const getItemLayout = useCallback((_, index) => ({
    length: width,
    offset: width * index,
    index,
  }), []);

  const goNextOrStart = () => {
    if (currentIndex < slides.length - 1) {
      flatListRef.current?.scrollToIndex({ index: currentIndex + 1, animated: true });
    } else {
      navigation.replace('MainTab');
    }
  };

  const renderItem = ({ item }) => (
    <View style={styles.slide}>
      <View style={styles.imageWrapper}>
        <Image source={item.image} style={[styles.image, item.imgStyle]} />
      </View>
      <Text style={styles.title}>{item.title}</Text>
      <Text style={styles.subtitle}>{item.subtitle}</Text>
    </View>
  );

  return (
    <View style={styles.container}>
      <FlatList
        data={slides}
        renderItem={renderItem}
        keyExtractor={(item) => item.id}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        ref={flatListRef}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={viewConfig}
        getItemLayout={getItemLayout}
        initialScrollIndex={0}
        extraData={currentIndex}
      />

      {/* 하단: 인디케이터 + 버튼 */}
      <View style={styles.footer}>
        <View style={styles.indicatorContainer}>
          {slides.map((_, index) => (
            <View
              key={index}
              style={[
                styles.dot,
                index === currentIndex ? styles.dotActive : styles.dotInactive,
              ]}
            />
          ))}
        </View>

        <TouchableOpacity style={styles.button} onPress={goNextOrStart}>
          <Text style={styles.buttonText}>
            {currentIndex === slides.length - 1 ? 'Start' : 'Next'}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

export default StartScreen;

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFFFFF' },

  slide: {
    width,
    alignItems: 'center',
    paddingHorizontal: 24,
    marginTop: Math.max(24, height * 0.1),
  },
  imageWrapper: {
    width: '100%',
    height: Math.max(280, Math.min(0.44 * height, 360)),
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  image: {
    width: '100%',
    resizeMode: 'contain',
  },

  title: {
    fontSize: 20,
    lineHeight: 26,
    fontWeight: '600',
    textAlign: 'center',
    color: '#111827',
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 14,
    lineHeight: 18,
    color: '#787878',
    textAlign: 'center',
    marginHorizontal: 12,
    marginBottom: 4,
  },
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: Math.max(60, height * 0.2),
    paddingHorizontal: 16,
    paddingBottom: 20,
    paddingTop: 8,
  },
  
  indicatorContainer: {
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
    flexDirection: 'row',
  },
  dot: {
    height: 8,
    borderRadius: 4,
    marginHorizontal: 6,
  },
  dotInactive: {
    width: 8,
    backgroundColor: '#D0D4DB',
  },
  dotActive: {
    width: 36, 
    backgroundColor: '#007AFF',
  },
  
  button: {
    backgroundColor: '#007AFF',
    borderRadius: 10,
    width: width * 0.8,
    height: 50,
    alignSelf: 'center',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '500' },
});
