import React from 'react';
import { View, Text, StyleSheet, ImageBackground, Dimensions, ActivityIndicator } from 'react-native';

const splashPhoto = require('../../assets/images/splash-photo.jpg');
const { height } = Dimensions.get('window');

export function LoadingScreen() {
  return (
    <View style={styles.container}>
      <ImageBackground
        source={splashPhoto}
        style={styles.backgroundImage}
        resizeMode="cover"
      >
        <View style={styles.overlay} />
        <View style={styles.content}>
          <Text style={styles.title}>Blade Outboards</Text>
          <ActivityIndicator size="large" color="rgba(255, 255, 255, 0.9)" style={styles.spinner} />
        </View>
      </ImageBackground>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  backgroundImage: {
    flex: 1,
    width: '100%',
    height: '100%',
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
  },
  content: {
    flex: 1,
    justifyContent: 'flex-end',
    alignItems: 'center',
    paddingBottom: height * 0.15,
  },
  title: {
    fontSize: 32,
    fontWeight: '600',
    color: '#FFFFFF',
    letterSpacing: 1.5,
    marginBottom: 20,
    textShadowColor: 'rgba(0, 0, 0, 0.5)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  spinner: {
    transform: [{ scale: 1.2 }],
  },
});
