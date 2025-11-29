import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import LoginScreen from './screens/LoginScreen';
import ClassListScreen from './screens/ClassListScreen';
import CameraScreen from './screens/CameraScreen';
import ManualEditScreen from './screens/ManualEditScreen';
import ExtraClassScreen from './screens/ExtraClassScreen';

const Stack = createNativeStackNavigator();

export default function App() {
  return (
    <NavigationContainer>
      <Stack.Navigator 
        screenOptions={{ 
          headerShown: false 
        }}
      >
        <Stack.Screen name="Login" component={LoginScreen} />
        <Stack.Screen name="ClassList" component={ClassListScreen} />
        <Stack.Screen name="Camera" component={CameraScreen} />
        <Stack.Screen name="ManualEdit" component={ManualEditScreen} />
        <Stack.Screen name="ExtraClass" component={ExtraClassScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}