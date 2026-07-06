import { createApp } from 'vue';
import Antd, {message} from 'ant-design-vue';
import 'ant-design-vue/dist/reset.css';
import App from './App.vue';
import './styles/index.less';

const app = createApp(App);
app.use(Antd);

message.config({
  top: `50%`,
  duration: 2,
  maxCount: 3,
  rtl: true,
});
app.mount('#app');
