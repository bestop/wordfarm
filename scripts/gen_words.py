#!/usr/bin/env python3
"""Generate 1200 elementary school English words for PvZ word game."""

def main():
    # ============ Difficulty 1 (简单) - ~400 words ============
    d1 = [
        # Numbers
        ("one", "一", 1), ("two", "二", 1), ("three", "三", 1), ("four", "四", 1),
        ("five", "五", 1), ("six", "六", 1), ("seven", "七", 1), ("eight", "八", 1),
        ("nine", "九", 1), ("ten", "十", 1), ("eleven", "十一", 1), ("twelve", "十二", 1),
        ("thirteen", "十三", 1), ("fourteen", "十四", 1), ("fifteen", "十五", 1),
        ("sixteen", "十六", 1), ("seventeen", "十七", 1), ("eighteen", "十八", 1),
        ("nineteen", "十九", 1), ("twenty", "二十", 1), ("hundred", "一百", 1),
        ("thousand", "一千", 1), ("first", "第一", 1), ("second", "第二", 1),
        ("third", "第三", 1),
        # Colors
        ("red", "红色的", 1), ("blue", "蓝色的", 1), ("green", "绿色的", 1),
        ("yellow", "黄色的", 1), ("white", "白色的", 1), ("black", "黑色的", 1),
        ("pink", "粉色的", 1), ("orange", "橙色的", 1), ("purple", "紫色的", 1),
        ("brown", "棕色的", 1), ("gray", "灰色的", 1), ("gold", "金色的", 1),
        ("silver", "银色的", 1),
        # Animals
        ("cat", "猫", 1), ("dog", "狗", 1), ("bird", "鸟", 1), ("fish", "鱼", 1),
        ("pig", "猪", 1), ("cow", "牛", 1), ("hen", "母鸡", 1), ("duck", "鸭子", 1),
        ("horse", "马", 1), ("sheep", "羊", 1), ("goat", "山羊", 1), ("mouse", "老鼠", 1),
        ("rabbit", "兔子", 1), ("frog", "青蛙", 1), ("bear", "熊", 1),
        ("monkey", "猴子", 1), ("panda", "熊猫", 1), ("tiger", "老虎", 1),
        ("lion", "狮子", 1), ("elephant", "大象", 1), ("fox", "狐狸", 1),
        ("wolf", "狼", 1), ("deer", "鹿", 1), ("bee", "蜜蜂", 1),
        ("ant", "蚂蚁", 1), ("butterfly", "蝴蝶", 1), ("snake", "蛇", 1),
        ("turtle", "乌龟", 1), ("whale", "鲸鱼", 1), ("shark", "鲨鱼", 1),
        ("chicken", "小鸡", 1), ("cock", "公鸡", 1), ("goose", "鹅", 1),
        # Family
        ("father", "父亲", 1), ("mother", "母亲", 1), ("brother", "兄弟", 1),
        ("sister", "姐妹", 1), ("son", "儿子", 1), ("daughter", "女儿", 1),
        ("grandpa", "爷爷", 1), ("grandma", "奶奶", 1), ("uncle", "叔叔", 1),
        ("aunt", "阿姨", 1), ("baby", "宝宝", 1), ("family", "家庭", 1),
        ("parent", "父母", 1), ("boy", "男孩", 1), ("girl", "女孩", 1),
        ("friend", "朋友", 1), ("classmate", "同学", 1),
        # Body
        ("head", "头", 1), ("face", "脸", 1), ("eye", "眼睛", 1),
        ("ear", "耳朵", 1), ("nose", "鼻子", 1), ("mouth", "嘴巴", 1),
        ("tooth", "牙齿", 1), ("tongue", "舌头", 1), ("neck", "脖子", 1),
        ("hand", "手", 1), ("arm", "手臂", 1), ("finger", "手指", 1),
        ("leg", "腿", 1), ("foot", "脚", 1), ("hair", "头发", 1),
        ("body", "身体", 1), ("knee", "膝盖", 1), ("shoulder", "肩膀", 1),
        # Food & Drink
        ("apple", "苹果", 1), ("banana", "香蕉", 1), ("orange", "橙子", 1),
        ("pear", "梨", 1), ("grape", "葡萄", 1), ("peach", "桃子", 1),
        ("lemon", "柠檬", 1), ("mango", "芒果", 1), ("cherry", "樱桃", 1),
        ("watermelon", "西瓜", 1), ("strawberry", "草莓", 1), ("pineapple", "菠萝", 1),
        ("rice", "米饭", 1), ("bread", "面包", 1), ("cake", "蛋糕", 1),
        ("egg", "鸡蛋", 1), ("milk", "牛奶", 1), ("water", "水", 1),
        ("tea", "茶", 1), ("juice", "果汁", 1), ("coffee", "咖啡", 1),
        ("meat", "肉", 1), ("chicken", "鸡肉", 1), ("fish", "鱼肉", 1),
        ("soup", "汤", 1), ("noodle", "面条", 1), ("candy", "糖果", 1),
        ("ice", "冰", 1), ("cream", "奶油", 1), ("salt", "盐", 1),
        ("sugar", "糖", 1), ("food", "食物", 1), ("fruit", "水果", 1),
        ("vegetable", "蔬菜", 1), ("tomato", "番茄", 1), ("potato", "土豆", 1),
        ("corn", "玉米", 1), ("bean", "豆子", 1),
        # School
        ("school", "学校", 1), ("book", "书", 1), ("pen", "钢笔", 1),
        ("pencil", "铅笔", 1), ("ruler", "尺子", 1), ("eraser", "橡皮", 1),
        ("bag", "书包", 1), ("desk", "课桌", 1), ("chair", "椅子", 1),
        ("teacher", "老师", 1), ("student", "学生", 1), ("class", "班级", 1),
        ("lesson", "课程", 1), ("homework", "作业", 1), ("test", "考试", 1),
        ("question", "问题", 1), ("answer", "回答", 1), ("page", "页", 1),
        ("word", "单词", 1), ("letter", "字母", 1), ("number", "数字", 1),
        ("paper", "纸", 1), ("map", "地图", 1), ("picture", "图片", 1),
        ("story", "故事", 1), ("poem", "诗歌", 1),
        # Nature
        ("sun", "太阳", 1), ("moon", "月亮", 1), ("star", "星星", 1),
        ("sky", "天空", 1), ("rain", "雨", 1), ("snow", "雪", 1),
        ("wind", "风", 1), ("cloud", "云", 1), ("tree", "树", 1),
        ("flower", "花", 1), ("grass", "草", 1), ("leaf", "叶子", 1),
        ("river", "河流", 1), ("lake", "湖泊", 1), ("sea", "大海", 1),
        ("mountain", "山", 1), ("hill", "小山", 1), ("forest", "森林", 1),
        ("park", "公园", 1), ("garden", "花园", 1), ("farm", "农场", 1),
        ("earth", "地球", 1), ("fire", "火", 1), ("stone", "石头", 1),
        ("sand", "沙子", 1), ("mud", "泥巴", 1), ("wood", "木头", 1),
        ("water", "水", 1), ("ice", "冰块", 1),
        # Time
        ("day", "天", 1), ("night", "夜晚", 1), ("morning", "早晨", 1),
        ("noon", "中午", 1), ("evening", "傍晚", 1), ("today", "今天", 1),
        ("tomorrow", "明天", 1), ("yesterday", "昨天", 1), ("week", "周", 1),
        ("month", "月", 1), ("year", "年", 1), ("hour", "小时", 1),
        ("minute", "分钟", 1), ("second", "秒", 1), ("clock", "时钟", 1),
        ("spring", "春天", 1), ("summer", "夏天", 1), ("autumn", "秋天", 1),
        ("winter", "冬天", 1), ("Monday", "周一", 1), ("Tuesday", "周二", 1),
        ("Wednesday", "周三", 1), ("Thursday", "周四", 1), ("Friday", "周五", 1),
        ("Saturday", "周六", 1), ("Sunday", "周日", 1),
        # Common Verbs
        ("be", "是", 1), ("have", "有", 1), ("do", "做", 1),
        ("go", "去", 1), ("come", "来", 1), ("get", "得到", 1),
        ("make", "制作", 1), ("take", "拿", 1), ("give", "给", 1),
        ("say", "说", 1), ("tell", "告诉", 1), ("ask", "问", 1),
        ("see", "看见", 1), ("look", "看", 1), ("watch", "观看", 1),
        ("hear", "听见", 1), ("listen", "听", 1), ("read", "读", 1),
        ("write", "写", 1), ("speak", "说话", 1), ("talk", "谈话", 1),
        ("play", "玩", 1), ("run", "跑", 1), ("walk", "走路", 1),
        ("jump", "跳", 1), ("swim", "游泳", 1), ("fly", "飞", 1),
        ("eat", "吃", 1), ("drink", "喝", 1), ("sleep", "睡觉", 1),
        ("sit", "坐", 1), ("stand", "站", 1), ("open", "打开", 1),
        ("close", "关闭", 1), ("help", "帮助", 1), ("like", "喜欢", 1),
        ("love", "爱", 1), ("want", "想要", 1), ("need", "需要", 1),
        ("know", "知道", 1), ("think", "想", 1), ("feel", "感觉", 1),
        ("find", "找到", 1), ("use", "使用", 1), ("try", "尝试", 1),
        ("put", "放", 1), ("call", "叫", 1), ("show", "展示", 1),
        ("sing", "唱歌", 1), ("dance", "跳舞", 1), ("draw", "画画", 1),
        ("cook", "做饭", 1), ("clean", "打扫", 1), ("wash", "洗", 1),
        ("wear", "穿", 1), ("buy", "买", 1), ("sell", "卖", 1),
        ("pay", "支付", 1), ("wait", "等待", 1), ("stop", "停止", 1),
        ("start", "开始", 1), ("learn", "学习", 1), ("study", "学习", 1),
        ("teach", "教", 1), ("work", "工作", 1), ("live", "居住", 1),
        ("die", "死", 1), ("win", "赢", 1), ("lose", "输", 1),
        ("send", "发送", 1), ("bring", "带来", 1), ("carry", "携带", 1),
        ("turn", "转", 1), ("fall", "落下", 1), ("hold", "握住", 1),
        ("keep", "保持", 1), ("leave", "离开", 1), ("meet", "见面", 1),
        ("move", "移动", 1), ("pull", "拉", 1), ("push", "推", 1),
        ("cut", "切", 1), ("pick", "捡", 1), ("point", "指", 1),
        ("count", "数数", 1), ("add", "加", 1), ("grow", "成长", 1),
        # Basic Adjectives
        ("good", "好的", 1), ("bad", "坏的", 1), ("big", "大的", 1),
        ("small", "小的", 1), ("long", "长的", 1), ("short", "短的", 1),
        ("tall", "高的", 1), ("new", "新的", 1), ("old", "旧的", 1),
        ("young", "年轻的", 1), ("hot", "热的", 1), ("cold", "冷的", 1),
        ("warm", "温暖的", 1), ("cool", "凉爽的", 1), ("happy", "快乐的", 1),
        ("sad", "伤心的", 1), ("angry", "生气的", 1), ("afraid", "害怕的", 1),
        ("fast", "快的", 1), ("slow", "慢的", 1), ("easy", "容易的", 1),
        ("hard", "困难的", 1), ("busy", "忙的", 1), ("free", "自由的", 1),
        ("clean", "干净的", 1), ("dirty", "脏的", 1), ("wet", "湿的", 1),
        ("dry", "干的", 1), ("full", "满的", 1), ("empty", "空的", 1),
        ("rich", "富有的", 1), ("poor", "贫穷的", 1), ("strong", "强壮的", 1),
        ("weak", "虚弱的", 1), ("right", "对的", 1), ("wrong", "错的", 1),
        ("same", "相同的", 1), ("early", "早的", 1), ("late", "迟的", 1),
        ("safe", "安全的", 1), ("hungry", "饥饿的", 1), ("thirsty", "渴的", 1),
        ("tired", "疲倦的", 1), ("sick", "生病的", 1), ("nice", "好的", 1),
        ("great", "伟大的", 1), ("fine", "好的", 1), ("sure", "确定的", 1),
        ("sorry", "抱歉的", 1), ("ready", "准备好的", 1),
        # Places
        ("home", "家", 1), ("house", "房子", 1), ("room", "房间", 1),
        ("door", "门", 1), ("window", "窗户", 1), ("bed", "床", 1),
        ("table", "桌子", 1), ("floor", "地板", 1), ("wall", "墙", 1),
        ("kitchen", "厨房", 1), ("bathroom", "浴室", 1), ("toilet", "厕所", 1),
        ("shop", "商店", 1), ("store", "商店", 1), ("bank", "银行", 1),
        ("hospital", "医院", 1), ("library", "图书馆", 1), ("museum", "博物馆", 1),
        ("zoo", "动物园", 1), ("cinema", "电影院", 1), ("church", "教堂", 1),
        ("street", "街道", 1), ("road", "路", 1), ("bridge", "桥", 1),
        ("city", "城市", 1), ("town", "城镇", 1), ("village", "村庄", 1),
        ("country", "国家", 1), ("world", "世界", 1),
        # Transport
        ("car", "汽车", 1), ("bus", "公共汽车", 1), ("bike", "自行车", 1),
        ("train", "火车", 1), ("ship", "船", 1), ("boat", "小船", 1),
        ("plane", "飞机", 1), ("taxi", "出租车", 1), ("truck", "卡车", 1),
        # Common nouns
        ("name", "名字", 1), ("man", "男人", 1), ("woman", "女人", 1),
        ("child", "孩子", 1), ("people", "人们", 1), ("thing", "东西", 1),
        ("place", "地方", 1), ("time", "时间", 1), ("money", "钱", 1),
        ("game", "游戏", 1), ("toy", "玩具", 1), ("ball", "球", 1),
        ("gift", "礼物", 1), ("key", "钥匙", 1), ("box", "盒子", 1),
        ("cup", "杯子", 1), ("plate", "盘子", 1), ("bottle", "瓶子", 1),
        ("glass", "玻璃杯", 1), ("knife", "刀", 1), ("fork", "叉子", 1),
        ("phone", "电话", 1), ("computer", "电脑", 1), ("TV", "电视", 1),
        ("radio", "收音机", 1), ("lamp", "灯", 1), ("clock", "钟表", 1),
        ("camera", "相机", 1), ("ticket", "票", 1), ("card", "卡片", 1),
        ("photo", "照片", 1), ("letter", "信件", 1),
        # Emotions & States
        ("happy", "高兴的", 1), ("sad", "悲伤的", 1), ("angry", "愤怒的", 1),
        ("scared", "害怕的", 1), ("tired", "疲惫的", 1), ("excited", "兴奋的", 1),
        ("surprised", "惊讶的", 1), ("proud", "骄傲的", 1), ("shy", "害羞的", 1),
        ("brave", "勇敢的", 1), ("kind", "善良的", 1), ("polite", "礼貌的", 1),
        ("quiet", "安静的", 1), ("loud", "吵闹的", 1),
        # Clothes
        ("shirt", "衬衫", 1), ("dress", "连衣裙", 1), ("skirt", "裙子", 1),
        ("pants", "裤子", 1), ("shoe", "鞋子", 1), ("sock", "袜子", 1),
        ("hat", "帽子", 1), ("coat", "外套", 1), ("cap", "鸭舌帽", 1),
    ]

    # ============ Difficulty 2 (中等) - ~400 words ============
    d2 = [
        # Animals (more)
        ("parrot", "鹦鹉", 2), ("eagle", "老鹰", 2), ("swan", "天鹅", 2),
        ("penguin", "企鹅", 2), ("dolphin", "海豚", 2), ("octopus", "章鱼", 2),
        ("crocodile", "鳄鱼", 2), ("giraffe", "长颈鹿", 2), ("zebra", "斑马", 2),
        ("camel", "骆驼", 2), ("koala", "考拉", 2), ("squirrel", "松鼠", 2),
        ("hedgehog", "刺猬", 2), ("owl", "猫头鹰", 2), ("peacock", "孔雀", 2),
        ("flamingo", "火烈鸟", 2), ("lobster", "龙虾", 2), ("crab", "螃蟹", 2),
        ("sparrow", "麻雀", 2), ("pigeon", "鸽子", 2), ("donkey", "驴", 2),
        ("turkey", "火鸡", 2),
        # Food (more)
        ("sandwich", "三明治", 2), ("hamburger", "汉堡包", 2), ("pizza", "披萨", 2),
        ("salad", "沙拉", 2), ("chocolate", "巧克力", 2), ("biscuit", "饼干", 2),
        ("cheese", "奶酪", 2), ("butter", "黄油", 2), ("honey", "蜂蜜", 2),
        ("pepper", "辣椒", 2), ("garlic", "大蒜", 2), ("onion", "洋葱", 2),
        ("cabbage", "卷心菜", 2), ("carrot", "胡萝卜", 2), ("mushroom", "蘑菇", 2),
        ("grape", "葡萄", 2), ("coconut", "椰子", 2), ("cherry", "樱桃", 2),
        ("walnut", "核桃", 2), ("peanut", "花生", 2), ("almond", "杏仁", 2),
        ("sausage", "香肠", 2), ("dumpling", "饺子", 2), ("noodle", "面条", 2),
        ("porridge", "粥", 2), ("yogurt", "酸奶", 2), ("jam", "果酱", 2),
        ("sauce", "酱汁", 2), ("vinegar", "醋", 2), ("soup", "汤", 2),
        ("pancake", "煎饼", 2), ("toffee", "太妃糖", 2),
        # School (more)
        ("subject", "科目", 2), ("science", "科学", 2), ("history", "历史", 2),
        ("geography", "地理", 2), ("music", "音乐", 2), ("art", "美术", 2),
        ("math", "数学", 2), ("English", "英语", 2), ("Chinese", "语文", 2),
        ("physics", "物理", 2), ("chemistry", "化学", 2), ("biology", "生物", 2),
        ("gym", "体育课", 2), ("recess", "课间休息", 2), ("exam", "考试", 2),
        ("grade", "成绩", 2), ("score", "分数", 2), ("prize", "奖品", 2),
        ("medal", "奖牌", 2), ("campus", "校园", 2),
        # Verbs (intermediate)
        ("believe", "相信", 2), ("remember", "记住", 2), ("forget", "忘记", 2),
        ("understand", "理解", 2), ("explain", "解释", 2), ("describe", "描述", 2),
        ("decide", "决定", 2), ("choose", "选择", 2), ("change", "改变", 2),
        ("follow", "跟随", 2), ("lead", "带领", 2), ("invite", "邀请", 2),
        ("visit", "拜访", 2), ("travel", "旅行", 2), ("arrive", "到达", 2),
        ("return", "返回", 2), ("continue", "继续", 2), ("finish", "完成", 2),
        ("practice", "练习", 2), ("imagine", "想象", 2), ("create", "创造", 2),
        ("invent", "发明", 2), ("discover", "发现", 2), ("collect", "收集", 2),
        ("protect", "保护", 2), ("share", "分享", 2), ("compare", "比较", 2),
        ("measure", "测量", 2), ("exchange", "交换", 2), ("receive", "收到", 2),
        ("accept", "接受", 2), ("refuse", "拒绝", 2), ("agree", "同意", 2),
        ("promise", "承诺", 2), ("apologize", "道歉", 2), ("forgive", "原谅", 2),
        ("suggest", "建议", 2), ("expect", "期望", 2), ("prepare", "准备", 2),
        ("organize", "组织", 2), ("celebrate", "庆祝", 2), ("perform", "表演", 2),
        ("compete", "竞争", 2), ("achieve", "达成", 2), ("connect", "连接", 2),
        ("communicate", "交流", 2), ("introduce", "介绍", 2), ("translate", "翻译", 2),
        ("pronounce", "发音", 2), ("spell", "拼写", 2), ("correct", "纠正", 2),
        ("copy", "复制", 2), ("print", "打印", 2), ("search", "搜索", 2),
        ("record", "记录", 2), ("repeat", "重复", 2), ("review", "复习", 2),
        ("improve", "提高", 2), ("develop", "发展", 2), ("increase", "增加", 2),
        ("reduce", "减少", 2), ("produce", "生产", 2), ("provide", "提供", 2),
        ("support", "支持", 2), ("include", "包括", 2), ("contain", "包含", 2),
        ("require", "需要", 2), ("consider", "考虑", 2), ("notice", "注意", 2),
        ("avoid", "避免", 2), ("miss", "想念", 2), ("wonder", "想知道", 2),
        ("realize", "意识到", 2), ("manage", "管理", 2), ("handle", "处理", 2),
        ("solve", "解决", 2),
        # Adjectives (intermediate)
        ("beautiful", "美丽的", 2), ("important", "重要的", 2), ("different", "不同的", 2),
        ("difficult", "困难的", 2), ("possible", "可能的", 2), ("necessary", "必要的", 2),
        ("popular", "受欢迎的", 2), ("famous", "著名的", 2), ("special", "特别的", 2),
        ("strange", "奇怪的", 2), ("dangerous", "危险的", 2), ("careful", "小心的", 2),
        ("useful", "有用的", 2), ("helpful", "有帮助的", 2), ("wonderful", "精彩的", 2),
        ("terrible", "可怕的", 2), ("comfortable", "舒适的", 2), ("enjoyable", "令人愉快的", 2),
        ("expensive", "昂贵的", 2), ("cheap", "便宜的", 2), ("valuable", "有价值的", 2),
        ("ancient", "古老的", 2), ("modern", "现代的", 2), ("simple", "简单的", 2),
        ("complex", "复杂的", 2), ("active", "活跃的", 2), ("patient", "耐心的", 2),
        ("honest", "诚实的", 2), ("lucky", "幸运的", 2), ("curious", "好奇的", 2),
        ("serious", "严肃的", 2), ("gentle", "温柔的", 2), ("cruel", "残忍的", 2),
        ("generous", "慷慨的", 2), ("selfish", "自私的", 2), ("nervous", "紧张的", 2),
        ("confident", "自信的", 2), ("creative", "有创意的", 2), ("energetic", "精力充沛的", 2),
        ("traditional", "传统的", 2), ("natural", "自然的", 2), ("cultural", "文化的", 2),
        ("social", "社交的", 2), ("personal", "个人的", 2), ("public", "公共的", 2),
        ("private", "私人的", 2), ("local", "当地的", 2), ("international", "国际的", 2),
        ("national", "国家的", 2), ("central", "中心的", 2), ("main", "主要的", 2),
        ("basic", "基本的", 2), ("certain", "确定的", 2), ("recent", "最近的", 2),
        ("regular", "规律的", 2), ("common", "常见的", 2), ("average", "平均的", 2),
        ("extra", "额外的", 2), ("enough", "足够的", 2), ("several", "几个", 2),
        ("whole", "整个的", 2), ("real", "真实的", 2), ("actual", "实际的", 2),
        ("sudden", "突然的", 2), ("rapid", "快速的", 2), ("slowly", "缓慢地", 2),
        # Places (more)
        ("airport", "机场", 2), ("station", "车站", 2), ("market", "市场", 2),
        ("restaurant", "餐厅", 2), ("hotel", "酒店", 2), ("office", "办公室", 2),
        ("factory", "工厂", 2), ("post", "邮局", 2), ("square", "广场", 2),
        ("tower", "塔", 2), ("palace", "宫殿", 2), ("castle", "城堡", 2),
        ("temple", "寺庙", 2), ("island", "岛屿", 2), ("beach", "海滩", 2),
        ("coast", "海岸", 2), ("valley", "山谷", 2), ("desert", "沙漠", 2),
        ("jungle", "丛林", 2), ("cave", "洞穴", 2), ("volcano", "火山", 2),
        ("universe", "宇宙", 2),
        # Nature (more)
        ("ocean", "海洋", 2), ("island", "岛屿", 2), ("cliff", "悬崖", 2),
        ("waterfall", "瀑布", 2), ("sunshine", "阳光", 2), ("rainbow", "彩虹", 2),
        ("thunder", "雷声", 2), ("lightning", "闪电", 2), ("fog", "雾", 2),
        ("frost", "霜", 2), ("dew", "露水", 2), ("breeze", "微风", 2),
        ("storm", "暴风雨", 2), ("climate", "气候", 2), ("temperature", "温度", 2),
        ("season", "季节", 2), ("environment", "环境", 2),
        # Occupations
        ("doctor", "医生", 2), ("nurse", "护士", 2), ("pilot", "飞行员", 2),
        ("driver", "司机", 2), ("farmer", "农民", 2), ("worker", "工人", 2),
        ("police", "警察", 2), ("soldier", "士兵", 2), ("sailor", "水手", 2),
        ("artist", "艺术家", 2), ("musician", "音乐家", 2), ("writer", "作家", 2),
        ("scientist", "科学家", 2), ("engineer", "工程师", 2), ("manager", "经理", 2),
        ("reporter", "记者", 2), ("actor", "演员", 2), ("singer", "歌手", 2),
        ("dancer", "舞者", 2), ("chef", "厨师", 2),
        # Abstract & Others
        ("dream", "梦想", 2), ("hope", "希望", 2), ("fear", "恐惧", 2),
        ("joy", "欢乐", 2), ("peace", "和平", 2), ("war", "战争", 2),
        ("power", "力量", 2), ("energy", "能量", 2), ("speed", "速度", 2),
        ("direction", "方向", 2), ("distance", "距离", 2), ("size", "大小", 2),
        ("shape", "形状", 2), ("circle", "圆形", 2), ("square", "正方形", 2),
        ("triangle", "三角形", 2), ("heart", "心", 2), ("brain", "大脑", 2),
        ("blood", "血液", 2), ("bone", "骨头", 2), ("muscle", "肌肉", 2),
        ("breath", "呼吸", 2), ("voice", "声音", 2), ("noise", "噪音", 2),
        ("silence", "沉默", 2), ("secret", "秘密", 2), ("rule", "规则", 2),
        ("law", "法律", 2), ("freedom", "自由", 2), ("truth", "真相", 2),
        ("knowledge", "知识", 2), ("wisdom", "智慧", 2), ("memory", "记忆", 2),
        ("attention", "注意力", 2), ("effort", "努力", 2), ("success", "成功", 2),
        ("failure", "失败", 2), ("progress", "进步", 2), ("advantage", "优势", 2),
        ("experience", "经验", 2), ("opinion", "观点", 2), ("advice", "建议", 2),
        ("mistake", "错误", 2), ("accident", "事故", 2), ("trouble", "麻烦", 2),
        ("problem", "问题", 2), ("solution", "解决方案", 2), ("method", "方法", 2),
        ("example", "例子", 2), ("reason", "原因", 2), ("result", "结果", 2),
        ("purpose", "目的", 2), ("chance", "机会", 2), ("choice", "选择", 2),
        ("tradition", "传统", 2), ("culture", "文化", 2), ("society", "社会", 2),
        ("community", "社区", 2), ("technology", "技术", 2), ("science", "科学", 2),
        ("education", "教育", 2), ("language", "语言", 2), ("grammar", "语法", 2),
        ("sentence", "句子", 2), ("vocabulary", "词汇", 2), ("conversation", "对话", 2),
        ("magazine", "杂志", 2), ("newspaper", "报纸", 2), ("dictionary", "字典", 2),
        ("calendar", "日历", 2), ("holiday", "假日", 2), ("festival", "节日", 2),
        ("birthday", "生日", 2), ("Christmas", "圣诞节", 2), ("Halloween", "万圣节", 2),
        ("journey", "旅程", 2), ("adventure", "冒险", 2), ("treasure", "宝藏", 2),
        ("courage", "勇气", 2), ("justice", "正义", 2), ("honesty", "诚实", 2),
        ("friendship", "友谊", 2), ("responsibility", "责任", 2),
        # Transport (more)
        ("subway", "地铁", 2), ("tram", "有轨电车", 2), ("ferry", "渡轮", 2),
        ("helicopter", "直升机", 2), ("rocket", "火箭", 2), ("engine", "引擎", 2),
        ("wheel", "轮子", 2), ("seat", "座位", 2), ("passenger", "乘客", 2),
        ("journey", "旅行", 2), ("voyage", "航行", 2),
        # Clothes (more)
        ("jacket", "夹克", 2), ("sweater", "毛衣", 2), ("uniform", "校服", 2),
        ("glove", "手套", 2), ("scarf", "围巾", 2), ("belt", "腰带", 2),
        ("boot", "靴子", 2), ("sandal", "凉鞋", 2), ("pocket", "口袋", 2),
        ("button", "纽扣", 2), ("zipper", "拉链", 2), ("ribbon", "丝带", 2),
        # Hobbies
        ("hobby", "爱好", 2), ("chess", "象棋", 2), ("puzzle", "拼图", 2),
        ("painting", "绘画", 2), ("photography", "摄影", 2), ("gardening", "园艺", 2),
        ("fishing", "钓鱼", 2), ("hiking", "徒步", 2), ("camping", "露营", 2),
        ("skating", "滑冰", 2), ("skiing", "滑雪", 2), ("swimming", "游泳", 2),
        ("running", "跑步", 2), ("cycling", "骑行", 2), ("cooking", "烹饪", 2),
        ("reading", "阅读", 2), ("writing", "写作", 2), ("singing", "唱歌", 2),
        ("dancing", "跳舞", 2), ("drawing", "画画", 2), ("craft", "手工", 2),
    ]

    # ============ Difficulty 3 (困难) - ~400 words ============
    d3 = [
        # Long / Academic Words
        ("accomplish", "完成", 3), ("acknowledge", "承认", 3), ("advertise", "做广告", 3),
        ("appreciate", "欣赏", 3), ("appropriate", "适当的", 3), ("arrangement", "安排", 3),
        ("atmosphere", "氛围", 3), ("attraction", "吸引力", 3), ("authority", "权威", 3),
        ("available", "可用的", 3), ("balance", "平衡", 3), ("barrier", "障碍", 3),
        ("behavior", "行为", 3), ("benefit", "好处", 3), ("breathe", "呼吸", 3),
        ("brilliant", "杰出的", 3), ("campaign", "活动", 3), ("capable", "有能力的", 3),
        ("celebration", "庆祝活动", 3), ("challenge", "挑战", 3), ("champion", "冠军", 3),
        ("character", "角色", 3), ("charity", "慈善", 3), ("circumstance", "情况", 3),
        ("comfort", "安慰", 3), ("command", "命令", 3), ("comment", "评论", 3),
        ("commercial", "商业的", 3), ("commitment", "承诺", 3), ("community", "社区", 3),
        ("comparison", "比较", 3), ("complaint", "投诉", 3), ("concentrate", "集中", 3),
        ("concern", "关切", 3), ("condition", "条件", 3), ("confidence", "信心", 3),
        ("conflict", "冲突", 3), ("confusion", "困惑", 3), ("connection", "联系", 3),
        ("consequence", "后果", 3), ("consideration", "考虑", 3), ("construction", "建设", 3),
        ("container", "容器", 3), ("contemporary", "当代的", 3), ("content", "内容", 3),
        ("contribute", "贡献", 3), ("convenient", "方便的", 3), ("convince", "说服", 3),
        ("cooperation", "合作", 3), ("correction", "纠正", 3), ("courageous", "勇敢的", 3),
        ("creativity", "创造力", 3), ("criminal", "罪犯", 3), ("criticism", "批评", 3),
        ("curiosity", "好奇心", 3), ("deadline", "截止日期", 3), ("debate", "辩论", 3),
        ("decision", "决定", 3), ("declaration", "宣言", 3), ("decoration", "装饰", 3),
        ("decrease", "减少", 3), ("defeat", "打败", 3), ("defend", "防守", 3),
        ("definite", "明确的", 3), ("delicious", "美味的", 3), ("delivery", "递送", 3),
        ("democracy", "民主", 3), ("demonstrate", "展示", 3), ("departure", "出发", 3),
        ("description", "描述", 3), ("desert", "沙漠", 3), ("deserve", "值得", 3),
        ("design", "设计", 3), ("desire", "渴望", 3), ("destruction", "破坏", 3),
        ("determination", "决心", 3), ("development", "发展", 3), ("disappear", "消失", 3),
        ("disappoint", "使失望", 3), ("disaster", "灾难", 3), ("discipline", "纪律", 3),
        ("discovery", "发现", 3), ("discuss", "讨论", 3), ("discussion", "讨论", 3),
        ("disease", "疾病", 3), ("display", "展示", 3), ("distance", "距离", 3),
        ("distinguish", "区分", 3), ("distribute", "分发", 3), ("disturb", "打扰", 3),
        ("document", "文件", 3), ("domestic", "国内的", 3), ("donation", "捐赠", 3),
        ("dormitory", "宿舍", 3), ("effective", "有效的", 3), ("election", "选举", 3),
        ("electricity", "电力", 3), ("eliminate", "消除", 3), ("embarrass", "使尴尬", 3),
        ("emergency", "紧急情况", 3), ("emotional", "情感的", 3), ("emphasis", "强调", 3),
        ("encourage", "鼓励", 3), ("enormous", "巨大的", 3), ("entertainment", "娱乐", 3),
        ("enthusiasm", "热情", 3), ("entire", "整个的", 3), ("entrance", "入口", 3),
        ("envelope", "信封", 3), ("equality", "平等", 3), ("equipment", "设备", 3),
        ("essential", "必要的", 3), ("establish", "建立", 3), ("estimate", "估计", 3),
        ("evaluate", "评估", 3), ("eventually", "最终", 3), ("evidence", "证据", 3),
        ("evolution", "进化", 3), ("exaggerate", "夸张", 3), ("examination", "考试", 3),
        ("excellent", "优秀的", 3), ("exception", "例外", 3), ("exchange", "交换", 3),
        ("exciting", "令人兴奋的", 3), ("exhibition", "展览", 3), ("existence", "存在", 3),
        ("expansion", "扩张", 3), ("expectation", "期望", 3), ("expedition", "探险", 3),
        ("expense", "费用", 3), ("experiment", "实验", 3), ("exploration", "探索", 3),
        ("exposition", "博览会", 3), ("extension", "延伸", 3), ("exterior", "外部的", 3),
        ("extraordinary", "非凡的", 3), ("extreme", "极端的", 3),
        # More difficulty 3 words
        ("facility", "设施", 3), ("fascinate", "迷住", 3), ("feature", "特征", 3),
        ("fertilizer", "肥料", 3), ("fiction", "小说", 3), ("figure", "数字", 3),
        ("financial", "金融的", 3), ("flexible", "灵活的", 3), ("flourish", "繁荣", 3),
        ("forbidden", "被禁止的", 3), ("forecast", "预报", 3), ("foreground", "前景", 3),
        ("formula", "公式", 3), ("fortune", "财富", 3), ("foundation", "基础", 3),
        ("fragile", "脆弱的", 3), ("frequent", "频繁的", 3), ("friendship", "友谊", 3),
        ("frontier", "边界", 3), ("frustrate", "使沮丧", 3), ("function", "功能", 3),
        ("fundamental", "基本的", 3), ("furniture", "家具", 3),
        ("generous", "慷慨的", 3), ("genuine", "真正的", 3), ("geography", "地理", 3),
        ("government", "政府", 3), ("gradually", "逐渐地", 3), ("grateful", "感激的", 3),
        ("guarantee", "保证", 3), ("guidance", "指导", 3),
        ("harmony", "和谐", 3), ("hesitate", "犹豫", 3), ("horizon", "地平线", 3),
        ("hostile", "敌意的", 3), ("humble", "谦虚的", 3), ("humorous", "幽默的", 3),
        ("hypothesis", "假设", 3),
        ("identify", "识别", 3), ("ignorance", "无知", 3), ("illustrate", "说明", 3),
        ("imagination", "想象力", 3), ("immediate", "立即的", 3), ("immigrate", "移民", 3),
        ("impact", "影响", 3), ("implement", "实施", 3), ("importance", "重要性", 3),
        ("impress", "使印象深刻", 3), ("improvement", "改进", 3), ("inadequate", "不充分的", 3),
        ("incident", "事件", 3), ("include", "包括", 3), ("increase", "增加", 3),
        ("independence", "独立", 3), ("indicate", "表明", 3), ("individual", "个人的", 3),
        ("industry", "工业", 3), ("ingredient", "成分", 3),
        ("initial", "最初的", 3), ("innocent", "无辜的", 3), ("innovation", "创新", 3),
        ("inquire", "询问", 3), ("inspect", "检查", 3), ("inspire", "激励", 3),
        ("install", "安装", 3), ("instance", "实例", 3), ("institute", "学院", 3),
        ("instrument", "乐器", 3), ("intelligence", "智力", 3), ("intelligent", "聪明的", 3),
        ("intend", "打算", 3), ("interest", "兴趣", 3), ("interior", "内部的", 3),
        ("interpret", "解释", 3), ("interview", "面试", 3), ("introduce", "介绍", 3),
        ("investigate", "调查", 3), ("investment", "投资", 3), ("invisible", "看不见的", 3),
        ("involve", "涉及", 3), ("isolate", "隔离", 3),
        ("landscape", "风景", 3), ("laughter", "笑声", 3), ("legitimate", "合法的", 3),
        ("liberate", "解放", 3), ("lifetime", "一生", 3), ("literature", "文学", 3),
        ("magnificent", "壮丽的", 3), ("maintain", "维持", 3), ("manufacture", "制造", 3),
        ("masterpiece", "杰作", 3), ("material", "材料", 3), ("mature", "成熟的", 3),
        ("mechanism", "机制", 3), ("medicine", "药物", 3), ("memorial", "纪念的", 3),
        ("mention", "提及", 3), ("merchant", "商人", 3), ("military", "军事的", 3),
        ("minimum", "最小值", 3), ("miracle", "奇迹", 3), ("mission", "使命", 3),
        ("moderate", "适度的", 3), ("modify", "修改", 3), ("monitor", "监视器", 3),
        ("monument", "纪念碑", 3), ("motivate", "激励", 3),
        ("negotiate", "谈判", 3), ("nervous", "紧张的", 3), ("neutral", "中立的", 3),
        ("nominate", "提名", 3), ("nonsense", "废话", 3), ("numerous", "许多的", 3),
        ("nutrition", "营养", 3),
        ("observe", "观察", 3), ("obstacle", "障碍", 3), ("obtain", "获得", 3),
        ("obvious", "明显的", 3), ("occasion", "场合", 3), ("occupy", "占据", 3),
        ("offend", "冒犯", 3), ("official", "官方的", 3), ("opponent", "对手", 3),
        ("opportunity", "机会", 3), ("oppose", "反对", 3), ("opposite", "相反的", 3),
        ("orchestra", "管弦乐队", 3), ("ordinary", "普通的", 3), ("organize", "组织", 3),
        ("origin", "起源", 3), ("original", "原始的", 3), ("overcome", "克服", 3),
        ("overlook", "忽略", 3),
        ("participate", "参加", 3), ("particular", "特定的", 3), ("passage", "段落", 3),
        ("passenger", "乘客", 3), ("passion", "热情", 3), ("patience", "耐心", 3),
        ("peculiar", "独特的", 3), ("perceive", "察觉", 3), ("permanent", "永久的", 3),
        ("permit", "允许", 3), ("persist", "坚持", 3), ("persuade", "说服", 3),
        ("phenomenon", "现象", 3), ("philosophy", "哲学", 3), ("physical", "身体的", 3),
        ("pleasant", "令人愉快的", 3), ("pledge", "誓言", 3), ("plunge", "投入", 3),
        ("popular", "流行的", 3), ("population", "人口", 3), ("portrait", "肖像", 3),
        ("positive", "积极的", 3), ("possess", "拥有", 3), ("postpone", "推迟", 3),
        ("potential", "潜在的", 3), ("practical", "实际的", 3), ("precious", "珍贵的", 3),
        ("precise", "精确的", 3), ("predict", "预测", 3), ("preserve", "保存", 3),
        ("pressing", "紧迫的", 3), ("prestigious", "有声望的", 3), ("previous", "以前的", 3),
        ("primarily", "主要地", 3), ("primitive", "原始的", 3), ("principle", "原则", 3),
        ("priority", "优先权", 3), ("privilege", "特权", 3), ("procedure", "程序", 3),
        ("process", "过程", 3), ("produce", "生产", 3), ("product", "产品", 3),
        ("profession", "职业", 3), ("professor", "教授", 3), ("profile", "简介", 3),
        ("program", "程序", 3), ("progress", "进步", 3), ("project", "项目", 3),
        ("promote", "促进", 3), ("proportion", "比例", 3), ("propose", "提议", 3),
        ("prospect", "前景", 3), ("prosperity", "繁荣", 3), ("protest", "抗议", 3),
        ("provide", "提供", 3), ("province", "省份", 3),
        ("qualification", "资格", 3), ("quantity", "数量", 3), ("quarrel", "争吵", 3),
        ("questionnaire", "问卷", 3),
        ("rebellion", "叛乱", 3), ("recognize", "认出", 3), ("recommend", "推荐", 3),
        ("recover", "恢复", 3), ("recreation", "娱乐", 3), ("recycle", "回收", 3),
        ("reduce", "减少", 3), ("refer", "参考", 3), ("reflect", "反映", 3),
        ("reform", "改革", 3), ("refuse", "拒绝", 3), ("register", "注册", 3),
        ("regulate", "调节", 3), ("reject", "拒绝", 3), ("relate", "联系", 3),
        ("relative", "亲戚", 3), ("relevant", "相关的", 3), ("reliable", "可靠的", 3),
        ("relief", "解脱", 3), ("religion", "宗教", 3), ("reluctant", "不情愿的", 3),
        ("remain", "保持", 3), ("remarkable", "显著的", 3), ("remedy", "疗法", 3),
        ("remember", "记住", 3), ("remind", "提醒", 3), ("remote", "遥远的", 3),
        ("remove", "移除", 3), ("renew", "续期", 3), ("rental", "租金", 3),
        ("repeatedly", "反复地", 3), ("replace", "替换", 3), ("represent", "代表", 3),
        ("reputation", "名誉", 3), ("request", "请求", 3), ("require", "需要", 3),
        ("research", "研究", 3), ("reserve", "预留", 3), ("resident", "居民", 3),
        ("resign", "辞职", 3), ("resist", "抵抗", 3), ("resolve", "解决", 3),
        ("resource", "资源", 3), ("respond", "回应", 3), ("restore", "恢复", 3),
        ("restriction", "限制", 3), ("retire", "退休", 3), ("reunion", "团聚", 3),
        ("revenue", "收入", 3), ("reverse", "相反的", 3), ("revise", "修改", 3),
        ("revolution", "革命", 3), ("sacrifice", "牺牲", 3), ("satellite", "卫星", 3),
        ("satisfy", "满足", 3), ("scholarship", "奖学金", 3), ("scientific", "科学的", 3),
        ("separate", "分开的", 3), ("sequence", "顺序", 3), ("session", "会议", 3),
        ("shelter", "庇护所", 3), ("significant", "重要的", 3), ("similar", "相似的", 3),
        ("simplify", "简化", 3), ("sincere", "真诚的", 3), ("situation", "情况", 3),
        ("sketch", "素描", 3), ("solution", "解决方案", 3), ("sophisticated", "复杂的", 3),
        ("souvenir", "纪念品", 3), ("spectacular", "壮观的", 3), ("struggle", "挣扎", 3),
        ("substance", "物质", 3), ("sufficient", "足够的", 3), ("suggestion", "建议", 3),
        ("summary", "摘要", 3), ("superior", "优越的", 3), ("supplement", "补充", 3),
        ("support", "支持", 3), ("suppose", "假设", 3), ("surround", "包围", 3),
        ("survival", "生存", 3), ("suspect", "怀疑", 3), ("suspicion", "怀疑", 3),
        ("symbol", "象征", 3), ("sympathy", "同情", 3),
        ("technique", "技术", 3), ("temperature", "温度", 3), ("temporary", "临时的", 3),
        ("territory", "领土", 3), ("theory", "理论", 3), ("thermometer", "温度计", 3),
        ("tradition", "传统", 3), ("transfer", "转移", 3), ("transform", "转变", 3),
        ("transport", "运输", 3), ("tremendous", "巨大的", 3), ("triumph", "胜利", 3),
        ("tropical", "热带的", 3),
        ("ultimately", "最终", 3), ("uncommon", "不寻常的", 3), ("undergo", "经历", 3),
        ("undertake", "承担", 3), ("unemployment", "失业", 3), ("unfortunately", "不幸地", 3),
        ("uniform", "统一的", 3), ("universal", "普遍的", 3), ("unusual", "不寻常的", 3),
        ("upgrade", "升级", 3), ("urban", "城市的", 3), ("urgency", "紧急", 3),
        ("useful", "有用的", 3), ("utilize", "利用", 3),
        ("vacation", "假期", 3), ("valley", "山谷", 3), ("valuable", "有价值的", 3),
        ("variation", "变化", 3), ("vehicle", "车辆", 3), ("venture", "冒险", 3),
        ("verdict", "裁决", 3), ("version", "版本", 3), ("veteran", "老兵", 3),
        ("victorious", "胜利的", 3), ("violence", "暴力", 3), ("virtue", "美德", 3),
        ("visible", "可见的", 3), ("vision", "视野", 3), ("volunteer", "志愿者", 3),
        ("vulnerable", "脆弱的", 3),
        ("warehouse", "仓库", 3), ("welfare", "福利", 3), ("wherever", "无论哪里", 3),
        ("willingness", "意愿", 3), ("witness", "目击者", 3), ("workshop", "研讨会", 3),
        ("worthwhile", "值得的", 3),
        ("yourself", "你自己", 3),
    ]

    # Fix any tuple vs list issues
    all_words = []
    for item in d1 + d2 + d3:
        if len(item) == 3 and isinstance(item[2], int):
            all_words.append({"en": item[0], "zh": item[1], "difficulty": item[2]})
        elif len(item) == 2 and isinstance(item[1], int):
            # handle accidental nesting
            pass

    # Remove duplicates (same en word)
    seen = set()
    unique = []
    for w in all_words:
        if w["en"].lower() not in seen:
            seen.add(w["en"].lower())
            unique.append(w)

    print(f"Total unique words: {len(unique)}")
    print(f"  Difficulty 1: {sum(1 for w in unique if w['difficulty'] == 1)}")
    print(f"  Difficulty 2: {sum(1 for w in unique if w['difficulty'] == 2)}")
    print(f"  Difficulty 3: {sum(1 for w in unique if w['difficulty'] == 3)}")

    # Generate the TypeScript file
    lines = []
    lines.append("// ============================================")
    lines.append("// 植物大战僵尸 · 背单词游戏 - 数据定义")
    lines.append("// 1200词小学英语词汇库")
    lines.append("// ============================================")
    lines.append("")
    lines.append("export interface Word {")
    lines.append("  en: string;")
    lines.append("  zh: string;")
    lines.append("  difficulty: 1 | 2 | 3;")
    lines.append("}")
    lines.append("")
    lines.append("export const WORD_BANK: Word[] = [")

    for i, w in enumerate(unique):
        comma = "," if i < len(unique) - 1 else ""
        lines.append(f"  {{ en: '{w['en']}', zh: '{w['zh']}', difficulty: {w['difficulty']} }}{comma}")

    lines.append("];")
    lines.append("")

    # Now read the rest of the original data.ts (everything after WORD_BANK)
    # We'll append the existing non-word-bank content
    lines.append("// ---- 植物定义 ----")
    lines.append("export interface PlantDef {")
    lines.append("  id: string;")
    lines.append("  name: string;")
    lines.append("  cost: number;")
    lines.append("  hp: number;")
    lines.append("  emoji: string;")
    lines.append("  color: string;")
    lines.append("  description: string;")
    lines.append("  attack?: number;")
    lines.append("  attackSpeed?: number;")
    lines.append("  slowEffect?: number;")
    lines.append("  doubleShot?: boolean;")
    lines.append("  explosive?: boolean;")
    lines.append("  explosionDamage?: number;")
    lines.append("  explosionRange?: number;")
    lines.append("}")
    lines.append("")
    lines.append("export const PLANT_DEFS: Record<string, PlantDef> = {")
    lines.append("  peashooter: { id: 'peashooter', name: '豌豆射手', cost: 100, hp: 100, emoji: '🫛', color: '#4CAF50', description: '发射豌豆攻击僵尸', attack: 20, attackSpeed: 1500 },")
    lines.append("  wallnut: { id: 'wallnut', name: '坚果墙', cost: 50, hp: 600, emoji: '🥜', color: '#8B6914', description: '高生命值阻挡僵尸' },")
    lines.append("  snowpea: { id: 'snowpea', name: '寒冰射手', cost: 175, hp: 100, emoji: '🧊', color: '#00BCD4', description: '冰冻豌豆减速僵尸', attack: 20, attackSpeed: 1500, slowEffect: 0.5 },")
    lines.append("  repeater: { id: 'repeater', name: '双发射手', cost: 200, hp: 100, emoji: '🌿', color: '#2E7D32', description: '连发两颗豌豆', attack: 20, attackSpeed: 1500, doubleShot: true },")
    lines.append("  cherrybomb: { id: 'cherrybomb', name: '樱桃炸弹', cost: 150, hp: 100, emoji: '🍒', color: '#F44336', description: '爆炸消灭周围僵尸', explosive: true, explosionDamage: 1800, explosionRange: 1 },")
    lines.append("};")
    lines.append("")
    lines.append("export type PlantType = keyof typeof PLANT_DEFS;")
    lines.append("export const PLANT_ORDER: PlantType[] = ['peashooter', 'wallnut', 'snowpea', 'repeater', 'cherrybomb'];")
    lines.append("")
    lines.append("// ---- 僵尸定义 ----")
    lines.append("export interface ZombieDef { id: string; name: string; hp: number; speed: number; damage: number; attackSpeed: number; color: string; emoji: string; }")
    lines.append("")
    lines.append("export const ZOMBIE_DEFS: Record<string, ZombieDef> = {")
    lines.append("  normal: { id: 'normal', name: '普通僵尸', hp: 200, speed: 14, damage: 80, attackSpeed: 1000, color: '#6B8E23', emoji: '🧟' },")
    lines.append("  cone: { id: 'cone', name: '路障僵尸', hp: 370, speed: 14, damage: 80, attackSpeed: 1000, color: '#FF8C00', emoji: '🧟' },")
    lines.append("  bucket: { id: 'bucket', name: '铁桶僵尸', hp: 650, speed: 14, damage: 80, attackSpeed: 1000, color: '#708090', emoji: '🧟' },")
    lines.append("  flag: { id: 'flag', name: '旗帜僵尸', hp: 200, speed: 24, damage: 80, attackSpeed: 1000, color: '#DC143C', emoji: '🚩' },")
    lines.append("};")
    lines.append("")
    lines.append("export type ZombieType = keyof typeof ZOMBIE_DEFS;")
    lines.append("")
    lines.append("// ---- 波次配置 ----")
    lines.append("export interface WaveConfig { zombies: { type: ZombieType; row?: number; delay: number }[]; }")
    lines.append("")
    lines.append("export const WAVE_CONFIGS: WaveConfig[] = [")
    lines.append("  { zombies: [ { type: 'normal', delay: 8000 }, { type: 'normal', delay: 15000 }, { type: 'normal', delay: 25000 } ] },")
    lines.append("  { zombies: [ { type: 'normal', delay: 5000 }, { type: 'normal', delay: 10000 }, { type: 'cone', delay: 16000 }, { type: 'normal', delay: 22000 }, { type: 'cone', delay: 28000 } ] },")
    lines.append("  { zombies: [ { type: 'normal', delay: 5000 }, { type: 'cone', delay: 9000 }, { type: 'normal', delay: 13000 }, { type: 'normal', delay: 17000 }, { type: 'cone', delay: 21000 }, { type: 'bucket', delay: 26000 }, { type: 'normal', delay: 30000 } ] },")
    lines.append("  { zombies: [ { type: 'cone', delay: 5000 }, { type: 'normal', delay: 8000 }, { type: 'bucket', delay: 12000 }, { type: 'normal', delay: 15000 }, { type: 'cone', delay: 19000 }, { type: 'normal', delay: 22000 }, { type: 'bucket', delay: 26000 }, { type: 'cone', delay: 30000 }, { type: 'normal', delay: 34000 } ] },")
    lines.append("  { zombies: [ { type: 'flag', delay: 5000 }, { type: 'cone', delay: 8000 }, { type: 'bucket', delay: 12000 }, { type: 'normal', delay: 15000 }, { type: 'cone', delay: 19000 }, { type: 'bucket', delay: 23000 }, { type: 'normal', delay: 27000 }, { type: 'cone', delay: 31000 }, { type: 'bucket', delay: 35000 }, { type: 'cone', delay: 39000 }, { type: 'bucket', delay: 43000 }, { type: 'normal', delay: 47000 } ] },")
    lines.append("];")
    lines.append("")
    lines.append("// ---- 游戏常量 ----")
    lines.append("export const GRID_COLS = 9;")
    lines.append("export const GRID_ROWS = 5;")
    lines.append("export const STARTING_SUN = 200;")
    lines.append("export const QUIZ_SUN_REWARD: Record<number, number> = { 1: 35, 2: 60, 3: 100 };")
    lines.append("export const QUIZ_TIME_LIMIT = 10000;")
    lines.append("export const QUIZ_COOLDOWN = 2000;")
    lines.append("export const ZOMBIE_SPEED_BOOST = 1.5;")
    lines.append("export const ZOMBIE_SPEED_BOOST_DURATION = 5000;")

    content = "\n".join(lines)
    with open("/home/z/my-project/src/game/data.ts", "w", encoding="utf-8") as f:
        f.write(content)
    print(f"Written {len(unique)} words to data.ts")

if __name__ == "__main__":
    main()
